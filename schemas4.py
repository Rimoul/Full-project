"""
Seazonal Swaad - Pydantic schemas (API contract + input validation)

SECURITY RULES BAKED INTO THIS FILE
-----------------------------------
1. Every REQUEST schema uses extra="forbid": unknown fields are rejected, so a
   client cannot sneak in `is_admin`, `price`, `status`, `is_verified_purchase`...
2. Requests NEVER contain user_id. The user always comes from the verified
   auth token, never from the request body (prevents IDOR / acting as someone else).
3. Requests NEVER contain prices, totals, discounts, stock or order/payment
   status. The backend calculates these from the database.
4. Every string has a max length; numbers have min/max; money is Decimal.
5. RESPONSE schemas list fields explicitly (allow-list). password_hash, OTPs,
   internal ids, stock counts and moderation flags are never exposed.
6. Public responses hide inactive / soft-deleted / hidden rows even if a route
   forgets to filter them.

These schemas make bad input impossible to *parse*. They do NOT replace
authorization checks (ownership), rate limiting, or server-side price
calculation in your routes.
"""

import re
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, ClassVar, Dict, Generic, List, Literal, Optional, TypeAlias, TypeVar
from urllib.parse import urlparse

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from models3 import (
    AddressType,
    DiscountType,
    CancellationStatus,
    ReturnStatus,
    RefundStatus,
    PolicyType,
    AdminRole,
    MediaType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    WeightUnit,
)

# ---------------------------------------------------------------------------
# Limits (change in one place)
# ---------------------------------------------------------------------------
MAX_CART_QTY_PER_ITEM = 20
MAX_STOCK = 1_000_000
# Argon2id does not silently truncate at 72 bytes like bcrypt; cap input to a
# bounded 256 UTF-8 bytes to avoid excessive request work while supporting passphrases.
PASSWORD_MAX_BYTES = 256


# ---------------------------------------------------------------------------
# Reusable validators / types
# ---------------------------------------------------------------------------
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")                 # any control char
_CONTROL_CHARS_ALLOW_NL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")  # allows \t \n \r
_HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z!?]")                   # "<script", "</b", "<!--" (but "<3" is fine)


def _single_line(v: str) -> str:
    if _CONTROL_CHARS.search(v):
        raise ValueError("control characters are not allowed")
    if _HTML_TAG.search(v):
        raise ValueError("HTML is not allowed")
    return v


def _multi_line(v: str) -> str:
    if _CONTROL_CHARS_ALLOW_NL.search(v):
        raise ValueError("control characters are not allowed")
    if _HTML_TAG.search(v):
        raise ValueError("HTML is not allowed")
    return v


def single_line(max_len: int, min_len: int = 1):
    return Annotated[str, Field(min_length=min_len, max_length=max_len), AfterValidator(_single_line)]


def multi_line(max_len: int, min_len: int = 1):
    return Annotated[str, Field(min_length=min_len, max_length=max_len), AfterValidator(_multi_line)]


# Explicit static type aliases keep Pylance happy while preserving Pydantic validation.
SingleLine50: TypeAlias = Annotated[str, Field(min_length=1, max_length=50), AfterValidator(_single_line)]
SingleLine100: TypeAlias = Annotated[str, Field(min_length=1, max_length=100), AfterValidator(_single_line)]
SingleLine150: TypeAlias = Annotated[str, Field(min_length=1, max_length=150), AfterValidator(_single_line)]
SingleLine255: TypeAlias = Annotated[str, Field(min_length=1, max_length=255), AfterValidator(_single_line)]
SingleLine500: TypeAlias = Annotated[str, Field(min_length=1, max_length=500), AfterValidator(_single_line)]
MultiLine500Min10: TypeAlias = Annotated[str, Field(min_length=10, max_length=500), AfterValidator(_multi_line)]
MultiLine1000: TypeAlias = Annotated[str, Field(min_length=1, max_length=1000), AfterValidator(_multi_line)]
MultiLine1000Min2: TypeAlias = Annotated[str, Field(min_length=2, max_length=1000), AfterValidator(_multi_line)]
MultiLine2000: TypeAlias = Annotated[str, Field(min_length=1, max_length=2000), AfterValidator(_multi_line)]
MultiLine10000: TypeAlias = Annotated[str, Field(min_length=1, max_length=10_000), AfterValidator(_multi_line)]
MultiLine20000: TypeAlias = Annotated[str, Field(min_length=1, max_length=20_000), AfterValidator(_multi_line)]


def _email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254:
        raise ValueError("email is too long")
    return v


def _phone(v: str) -> str:
    """Normalize to E.164, e.g. 98765 43210 -> +919876543210."""
    v = re.sub(r"[\s\-()]", "", v)
    if re.fullmatch(r"[6-9]\d{9}", v):          # 10-digit Indian mobile
        v = "+91" + v
    elif re.fullmatch(r"91[6-9]\d{9}", v):
        v = "+" + v
    if not re.fullmatch(r"\+[1-9]\d{9,14}", v):
        raise ValueError("invalid phone number")
    return v


def _password_bytes(v: str) -> str:
    if len(v.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError("password is too long")
    return v


def _new_password(v: str) -> str:
    _password_bytes(v)
    if not re.search(r"[a-z]", v) or not re.search(r"[A-Z]", v) or not re.search(r"\d", v):
        raise ValueError("password must contain an uppercase letter, a lowercase letter and a digit")
    return v


def _https_url(v: str) -> str:
    p = urlparse(v)
    if p.scheme != "https" or not p.netloc or p.username or p.password:
        raise ValueError("must be a valid https URL")
    if _CONTROL_CHARS.search(v) or " " in v:
        raise ValueError("invalid URL")
    return v


def _live(items):
    """Drop inactive / hidden / soft-deleted rows from nested lists in PUBLIC responses."""
    return [
        i for i in items
        if getattr(i, "is_active", True)
        and getattr(i, "is_visible", True)
        and getattr(i, "deleted_at", None) is None
    ]


Id = Annotated[int, Field(gt=0, le=2_147_483_647)]
Qty = Annotated[int, Field(ge=1, le=MAX_CART_QTY_PER_ITEM)]
Stock = Annotated[int, Field(ge=0, le=MAX_STOCK)]
SortOrder = Annotated[int, Field(ge=0, le=10_000)]
Rating = Annotated[int, Field(ge=1, le=5)]

Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]

Email = Annotated[EmailStr, AfterValidator(_email)]
Phone = Annotated[str, Field(min_length=10, max_length=20), AfterValidator(_phone)]
NewPassword = Annotated[str, Field(min_length=8, max_length=128, repr=False), AfterValidator(_new_password)]
LoginPassword = Annotated[str, Field(min_length=1, max_length=128, repr=False), AfterValidator(_password_bytes)]
OTPCode = Annotated[str, Field(pattern=r"^\d{6}$")]
Name: TypeAlias = SingleLine100
Slug = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
SKU = Annotated[str, Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")]
PinCode = Annotated[str, Field(pattern=r"^[1-9]\d{5}$")]  # India: 6 digits, string keeps leading zeroes safe
CouponCode = Annotated[str, Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_-]+$"), AfterValidator(str.upper)]
OrderNumber = Annotated[str, Field(min_length=3, max_length=20, pattern=r"^[A-Z0-9]+$")]
HttpsUrl = Annotated[str, Field(max_length=2048), AfterValidator(_https_url)]
Latitude = Annotated[Decimal, Field(ge=-90, le=90, max_digits=9, decimal_places=6)]
Longitude = Annotated[Decimal, Field(ge=-180, le=180, max_digits=9, decimal_places=6)]
GatewayRef = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_\-]+$")]
GatewaySignature = Annotated[str, Field(min_length=1, max_length=256, pattern=r"^[A-Za-z0-9]+$")]
IdempotencyKey = Annotated[str, Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")]


# ---------------------------------------------------------------------------
# Base classes
# ---------------------------------------------------------------------------
class StrictRequest(BaseModel):
    """Base for everything the client SENDS."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PartialUpdate(StrictRequest):
    """
    Base for PATCH-style updates. Rejects an empty body and rejects explicit
    nulls for fields that are NOT NULL in the database (which would otherwise
    cause a 500 error).
    """
    nullable_fields: ClassVar[frozenset] = frozenset()

    @model_validator(mode="after")
    def check_update(self):
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        for name in self.model_fields_set:
            if getattr(self, name) is None and name not in self.nullable_fields:
                raise ValueError(f"'{name}' cannot be null")
        return self


class ResponseBase(BaseModel):
    """Base for everything the server SENDS (built from ORM objects)."""
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


class MessageResponse(BaseModel):
    message: str


# ===========================================================================
# AUTH & USERS
# ===========================================================================
class UserCreate(StrictRequest):
    """Step 1 of sign-up. Role, verification flags and provider are NOT accepted."""
    first_name: Name
    last_name: Optional[Name] = None
    email: Email
    password: NewPassword

    @model_validator(mode="after")
    def password_not_email(self):
        local = str(self.email).split("@")[0]
        if len(local) >= 4 and local in self.password.lower():
            raise ValueError("password must not contain your email name")
        return self


class UserLogin(StrictRequest):
    email: Email
    password: LoginPassword  # no strength rules on login (don't reveal policy / lock out old accounts)


class OTPVerify(StrictRequest):
    email: Email
    otp_code: OTPCode


class OTPResend(StrictRequest):
    email: Email


class PasswordResetRequest(StrictRequest):
    email: Email


class PasswordResetConfirm(StrictRequest):
    token: Annotated[str, Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
    new_password: NewPassword


class UserAddPhone(StrictRequest):
    """user_id is NOT accepted: the phone is attached to the logged-in user."""
    phone_number: Phone


class PhoneOTPVerify(StrictRequest):
    otp_code: OTPCode


class GoogleToken(StrictRequest):
    # A Google ID token is a JWT: three base64url parts separated by dots.
    credential: str = Field(min_length=20, max_length=4096, pattern=r"^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$")


class ProfileUpdate(PartialUpdate):
    first_name: Optional[Name] = None
    last_name: Optional[Name] = None
    nullable_fields: ClassVar[frozenset] = frozenset({"last_name"})


class PasswordChange(StrictRequest):
    current_password: LoginPassword
    new_password: NewPassword

    @model_validator(mode="after")
    def must_differ(self):
        if self.current_password == self.new_password:
            raise ValueError("new password must be different")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class UserResponse(ResponseBase):
    """Safe public view of a user. No password_hash, OTP, provider or soft-delete data."""
    user_id: int
    first_name: str
    last_name: Optional[str] = None
    email: str
    phone_number: Optional[str] = None
    email_verified: bool
    mobile_verified: bool
    created_at: datetime


# ===========================================================================
# ADDRESSES
# ===========================================================================
class AddressCreate(StrictRequest):
    address_type: AddressType = AddressType.Home
    label: Optional[SingleLine100] = None
    recipient_name: Name
    phone_number: Phone
    address_line: SingleLine255
    landmark: Optional[SingleLine255] = None
    city: SingleLine100
    state: SingleLine100
    pin_code: PinCode
    country: Literal["India"] = "India"
    latitude: Optional[Latitude] = None
    longitude: Optional[Longitude] = None
    is_default: bool = False

    @model_validator(mode="after")
    def coords_together(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class AddressUpdate(PartialUpdate):
    address_type: Optional[AddressType] = None
    label: Optional[SingleLine100] = None
    recipient_name: Optional[Name] = None
    phone_number: Optional[Phone] = None
    address_line: Optional[SingleLine255] = None
    landmark: Optional[SingleLine255] = None
    city: Optional[SingleLine100] = None
    state: Optional[SingleLine100] = None
    pin_code: Optional[PinCode] = None
    latitude: Optional[Latitude] = None
    longitude: Optional[Longitude] = None
    is_default: Optional[bool] = None
    nullable_fields: ClassVar[frozenset] = frozenset({"label", "landmark", "latitude", "longitude"})


class AddressResponse(ResponseBase):
    address_id: int
    address_type: AddressType
    label: Optional[str] = None
    recipient_name: str
    phone_number: str
    address_line: str
    landmark: Optional[str] = None
    city: str
    state: str
    pin_code: str
    country: str
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    is_default: bool


# ===========================================================================
# CATALOGUE (public responses)
# ===========================================================================
class CategoryResponse(ResponseBase):
    category_id: int
    name: str
    slug: str
    description: Optional[str] = None


class ProductMediaResponse(ResponseBase):
    media_id: int
    media_type: MediaType
    media_url: str
    thumbnail_url: Optional[str] = None
    alt_text: Optional[str] = None
    sort_order: int
    is_primary: bool


class HighlightResponse(ResponseBase):
    highlight_text: str
    sort_order: int


class IngredientResponse(ResponseBase):
    ingredient_name: str
    sort_order: int


class VariantPublic(ResponseBase):
    """Customers see 'in stock or not', never the exact stock count or SKU."""
    variant_id: int
    weight_value: Decimal
    weight_unit: WeightUnit
    selling_price: Decimal
    original_price: Optional[Decimal] = None
    stock_quantity: int = Field(exclude=True)  # used for calculations only, never serialized

    @computed_field
    @property
    def weight_label(self) -> str:
        return f"{format(self.weight_value.normalize(), 'f')} {self.weight_unit.value}"

    @computed_field
    @property
    def in_stock(self) -> bool:
        return self.stock_quantity > 0

    @computed_field
    @property
    def discount_percent(self) -> Optional[int]:
        """Calculated, never stored. Only shown when original > selling."""
        if self.original_price and self.original_price > self.selling_price:
            pct = (self.original_price - self.selling_price) / self.original_price * 100
            return int(pct.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return None


class ProductBrief(ResponseBase):
    """Small product reference used inside cart / wishlist responses."""
    product_id: int
    name: str
    slug: str
    # Populate via a `primary_image_url` property on the Product model, or set it in the route.
    primary_image_url: Optional[str] = None


class ProductSummary(ResponseBase):
    """Product card for list/search pages."""
    product_id: int
    name: str
    slug: str
    short_description: Optional[str] = None
    primary_image_url: Optional[str] = None
    average_rating: Optional[float] = None   # computed by the route from visible reviews
    review_count: int = 0                    # computed by the route
    variants: List[VariantPublic] = Field(default_factory=list)

    @field_validator("variants", mode="before")
    @classmethod
    def live_variants(cls, v):
        return _live(v)


class ProductDetail(ProductSummary):
    long_description: Optional[str] = None
    categories: List[CategoryResponse] = Field(default_factory=list)
    media: List[ProductMediaResponse] = Field(default_factory=list)
    highlights: List[HighlightResponse] = Field(default_factory=list)
    ingredients: List[IngredientResponse] = Field(default_factory=list)

    @field_validator("categories", "media", "highlights", "ingredients", mode="before")
    @classmethod
    def live_lists(cls, v):
        return _live(v)


# ===========================================================================
# CART & WISHLIST  (user comes from the token; prices are never sent by client)
# ===========================================================================
class CartItemCreate(StrictRequest):
    variant_id: Id
    quantity: Qty = 1


class CartItemUpdate(StrictRequest):
    quantity: Qty  # to remove an item use DELETE, not quantity 0


class CartVariant(VariantPublic):
    product: ProductBrief


class CartItemResponse(ResponseBase):
    cart_item_id: int
    quantity: int
    variant: CartVariant

    @computed_field
    @property
    def line_total(self) -> Decimal:
        """Display only. The server recalculates everything at checkout."""
        return self.variant.selling_price * self.quantity


class CartResponse(BaseModel):
    items: List[CartItemResponse] = Field(default_factory=list)

    @computed_field
    @property
    def subtotal(self) -> Decimal:
        return sum((i.line_total for i in self.items), Decimal("0.00"))


class WishlistAdd(StrictRequest):
    product_id: Id


class WishlistItemResponse(ResponseBase):
    wishlist_item_id: int
    product: ProductBrief
    added_at: datetime


# ===========================================================================
# COUPONS, ORDERS, PAYMENTS
# ===========================================================================
class CouponApply(StrictRequest):
    code: CouponCode


class CouponPreviewResponse(BaseModel):
    code: str
    discount_amount: Decimal  # informational only; recalculated and re-validated when the order is placed


class OrderCreate(StrictRequest):
    """
    The client says WHAT address / payment method / coupon. It never sends items,
    prices, totals, discounts or status: the server builds the order from the
    user's cart in the database.
    """
    address_id: Id
    payment_method: PaymentMethod
    coupon_code: Optional[CouponCode] = None
    terms_accepted: Literal[True]                    # false / missing -> rejected
    idempotency_key: Optional[IdempotencyKey] = None  # stops double-click duplicate orders


class OrderCancelRequest(StrictRequest):
    reason: Optional[SingleLine255] = None


class OrderItemResponse(ResponseBase):
    order_item_id: int
    product_id: Optional[int] = None
    variant_id: Optional[int] = None
    snapshot_name: str
    snapshot_weight: str
    snapshot_image: Optional[str] = None
    purchased_price: Decimal
    original_price: Optional[Decimal] = None
    quantity: int
    discount_amount: Decimal
    line_total: Decimal


class OrderTrackingResponse(ResponseBase):
    """updated_by (internal staff identity) is intentionally NOT exposed."""
    status_step: OrderStatus
    description: Optional[str] = None
    location: Optional[str] = None
    logged_at: datetime


class OrderSummary(ResponseBase):
    """Row in 'My Orders'. Uses the public order_number, not the internal order_id."""
    order_number: str
    current_status: OrderStatus
    payment_status: PaymentStatus
    total_amount: Decimal
    currency: str
    placed_at: datetime
    expected_delivery: Optional[date] = None


class OrderResponse(OrderSummary):
    shipping_name: str
    shipping_phone: str
    shipping_address_line: str
    shipping_landmark: Optional[str] = None
    shipping_city: str
    shipping_state: str
    shipping_pin_code: str
    shipping_country: str
    subtotal: Decimal
    discount_applied: Decimal
    delivery_charge: Decimal
    tax_amount: Decimal
    cancelled_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    items: List[OrderItemResponse] = Field(default_factory=list)
    tracking: List[OrderTrackingResponse] = Field(default_factory=list)


class PaymentInitResponse(BaseModel):
    """What the frontend needs to open the payment gateway popup."""
    order_number: str
    gateway_order_id: str
    amount: Decimal
    currency: str


class PaymentVerifyRequest(StrictRequest):
    """
    Gateway callback data. The route MUST verify the signature server-side and
    compare the amount with the order total before marking anything as paid.
    """
    order_number: OrderNumber
    gateway_order_id: GatewayRef
    gateway_payment_id: GatewayRef
    gateway_signature: GatewaySignature


class PaymentResponse(ResponseBase):
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    amount: Decimal
    currency: str
    created_at: datetime
    paid_at: Optional[datetime] = None


# ===========================================================================
# REVIEWS & Q&A
# ===========================================================================
class ReviewCreate(StrictRequest):
    """is_verified_purchase / is_visible are NOT accepted; the backend decides them."""
    product_id: Id
    order_item_id: Optional[Id] = None
    rating: Rating
    review_text: Optional[MultiLine2000] = None


class ReviewUpdate(PartialUpdate):
    rating: Optional[Rating] = None
    review_text: Optional[MultiLine2000] = None
    nullable_fields: ClassVar[frozenset] = frozenset({"review_text"})


class ReviewResponse(ResponseBase):
    review_id: int
    product_id: int
    rating: int
    review_text: Optional[str] = None
    is_verified_purchase: bool
    created_at: datetime
    reviewer_name: Optional[str] = None  # set in the route as first name + last initial (no email!)


class RatingSummary(BaseModel):
    average_rating: Optional[float] = None
    review_count: int = 0
    distribution: Dict[int, int] = Field(default_factory=dict)  # {5: 12, 4: 3, ...}


class QuestionCreate(StrictRequest):
    product_id: Id
    question_text: MultiLine500Min10


class AnswerCreate(StrictRequest):
    answer_text: MultiLine1000Min2


class AnswerResponse(ResponseBase):
    answer_id: int
    answer_text: str
    is_official: bool
    created_at: datetime


class QuestionResponse(ResponseBase):
    question_id: int
    question_text: str
    created_at: datetime
    answers: List[AnswerResponse] = Field(default_factory=list)

    @field_validator("answers", mode="before")
    @classmethod
    def visible_answers(cls, v):
        return _live(v)


# ===========================================================================
# ADMIN ONLY  (protect every route using these with an admin-role check)
# ===========================================================================
class CategoryCreate(StrictRequest):
    name: SingleLine100
    slug: Slug
    description: Optional[MultiLine1000] = None
    is_active: bool = True
    sort_order: SortOrder = 0


class CategoryUpdate(PartialUpdate):
    name: Optional[SingleLine100] = None
    slug: Optional[Slug] = None
    description: Optional[MultiLine1000] = None
    is_active: Optional[bool] = None
    sort_order: Optional[SortOrder] = None
    nullable_fields: ClassVar[frozenset] = frozenset({"description"})


class VariantCreate(StrictRequest):
    weight_value: PositiveMoney
    weight_unit: WeightUnit
    selling_price: Money
    original_price: Optional[Money] = None
    stock_quantity: Stock = 0
    sku: SKU
    is_active: bool = True

    @model_validator(mode="after")
    def original_not_below_selling(self):
        if self.original_price is not None and self.original_price < self.selling_price:
            raise ValueError("original_price cannot be lower than selling_price")
        return self


class VariantUpdate(PartialUpdate):
    weight_value: Optional[PositiveMoney] = None
    weight_unit: Optional[WeightUnit] = None
    selling_price: Optional[Money] = None
    original_price: Optional[Money] = None
    stock_quantity: Optional[Stock] = None
    sku: Optional[SKU] = None
    is_active: Optional[bool] = None
    nullable_fields: ClassVar[frozenset] = frozenset({"original_price"})

    @model_validator(mode="after")
    def original_not_below_selling(self):
        if self.original_price is not None and self.selling_price is not None \
                and self.original_price < self.selling_price:
            raise ValueError("original_price cannot be lower than selling_price")
        return self


class MediaCreate(StrictRequest):
    media_type: MediaType = MediaType.image
    media_url: HttpsUrl
    thumbnail_url: Optional[HttpsUrl] = None
    alt_text: Optional[SingleLine255] = None
    sort_order: SortOrder = 0
    is_primary: bool = False


class ProductCreate(StrictRequest):
    name: SingleLine255
    slug: Slug
    short_description: Optional[SingleLine500] = None
    long_description: Optional[MultiLine10000] = None
    is_active: bool = True
    category_ids: List[Id] = Field(default_factory=list, max_length=20)
    variants: List[VariantCreate] = Field(min_length=1, max_length=20)
    media: List[MediaCreate] = Field(default_factory=list, max_length=20)
    highlights: List[SingleLine255] = Field(default_factory=list, max_length=20)
    ingredients: List[SingleLine150] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def consistency(self):
        if len(set(self.category_ids)) != len(self.category_ids):
            raise ValueError("duplicate category_ids")
        skus = [v.sku.lower() for v in self.variants]
        if len(set(skus)) != len(skus):
            raise ValueError("duplicate SKU in variants")
        if sum(1 for m in self.media if m.is_primary) > 1:
            raise ValueError("only one media item can be primary")
        return self


class ProductUpdate(PartialUpdate):
    name: Optional[SingleLine255] = None
    slug: Optional[Slug] = None
    short_description: Optional[SingleLine500] = None
    long_description: Optional[MultiLine10000] = None
    is_active: Optional[bool] = None
    category_ids: Optional[List[Id]] = Field(default=None, max_length=20)
    nullable_fields: ClassVar[frozenset] = frozenset({"short_description", "long_description"})

    @field_validator("category_ids")
    @classmethod
    def unique_ids(cls, v):
        if v is not None and len(set(v)) != len(v):
            raise ValueError("duplicate category_ids")
        return v


class VariantAdminResponse(ResponseBase):
    variant_id: int
    weight_value: Decimal
    weight_unit: WeightUnit
    selling_price: Decimal
    original_price: Optional[Decimal] = None
    stock_quantity: int
    sku: str
    is_active: bool


class ProductAdminResponse(ResponseBase):
    product_id: int
    name: str
    slug: str
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    is_active: bool
    added_at: datetime
    updated_at: datetime
    categories: List[CategoryResponse] = Field(default_factory=list)
    variants: List[VariantAdminResponse] = Field(default_factory=list)


class OrderStatusUpdate(StrictRequest):
    """The route must also check that the status TRANSITION is allowed (e.g. Delivered -> Pending is not)."""
    status: OrderStatus
    description: Optional[SingleLine255] = None
    location: Optional[SingleLine150] = None
    expected_delivery: Optional[date] = None


class CouponCreate(StrictRequest):
    code: CouponCode
    description: Optional[SingleLine255] = None
    discount_type: DiscountType
    discount_value: PositiveMoney
    minimum_order_amount: Optional[Money] = None
    maximum_discount: Optional[Money] = None
    starts_at: Optional[AwareDatetime] = None
    expires_at: Optional[AwareDatetime] = None
    usage_limit: Optional[Annotated[int, Field(ge=1, le=10_000_000)]] = None
    per_user_limit: Optional[Annotated[int, Field(ge=1, le=1000)]] = None
    is_active: bool = True

    @model_validator(mode="after")
    def sanity(self):
        if self.discount_type == DiscountType.Percentage and self.discount_value > 100:
            raise ValueError("percentage discount cannot exceed 100")
        if self.starts_at and self.expires_at and self.expires_at <= self.starts_at:
            raise ValueError("expires_at must be after starts_at")
        return self

# ===========================================================================
# ADDITIONAL MODEL-ALIGNED SCHEMAS
# These cover the remaining tables/enums defined in models2.py.
# ===========================================================================

class AdminLogin(StrictRequest):
    email: Email
    password: LoginPassword


class AdminResponse(ResponseBase):
    admin_id: int
    name: str
    email: str
    role: AdminRole
    is_active: bool


class ProductHighlightCreate(StrictRequest):
    highlight_text: SingleLine255
    sort_order: SortOrder = 0
    is_active: bool = True


class ProductHighlightUpdate(PartialUpdate):
    highlight_text: Optional[SingleLine255] = None
    sort_order: Optional[SortOrder] = None
    is_active: Optional[bool] = None


class ProductIngredientCreate(StrictRequest):
    ingredient_name: SingleLine150
    sort_order: SortOrder = 0
    is_active: bool = True


class ProductIngredientUpdate(PartialUpdate):
    ingredient_name: Optional[SingleLine150] = None
    sort_order: Optional[SortOrder] = None
    is_active: Optional[bool] = None


class MediaUpdate(PartialUpdate):
    media_type: Optional[MediaType] = None
    media_url: Optional[HttpsUrl] = None
    thumbnail_url: Optional[HttpsUrl] = None
    alt_text: Optional[SingleLine255] = None
    sort_order: Optional[SortOrder] = None
    is_primary: Optional[bool] = None
    nullable_fields: ClassVar[frozenset] = frozenset({"thumbnail_url", "alt_text"})


class ProductQuestionResponse(ResponseBase):
    question_id: int
    product_id: int
    question_text: str
    is_visible: bool
    created_at: datetime
    answers: List[AnswerResponse] = Field(default_factory=list)


class ProductAnswerResponse(ResponseBase):
    answer_id: int
    question_id: int
    user_id: int
    answer_text: str
    is_official: bool
    is_visible: bool
    created_at: datetime


class CouponResponse(ResponseBase):
    coupon_id: int
    code: str
    description: Optional[str] = None
    discount_type: DiscountType
    discount_value: Decimal
    minimum_order_amount: Optional[Decimal] = None
    maximum_discount: Optional[Decimal] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    usage_limit: Optional[int] = None
    per_user_limit: Optional[int] = None
    is_active: bool


class OrderCancellationCreate(StrictRequest):
    reason: Optional[SingleLine255] = None


class OrderCancellationResponse(ResponseBase):
    cancellation_id: int
    order_id: int
    reason: Optional[str] = None
    cancellation_status: CancellationStatus
    refund_required: bool
    requested_at: datetime
    processed_at: Optional[datetime] = None
    processed_by: Optional[str] = None


class ReturnCreate(StrictRequest):
    order_number: OrderNumber
    reason: Optional[SingleLine255] = None
    customer_notes: Optional[MultiLine2000] = None


class ReturnItemCreate(StrictRequest):
    order_item_id: Id
    quantity: Qty
    reason: Optional[SingleLine255] = None


class ReturnStatusUpdate(StrictRequest):
    return_status: ReturnStatus


class ReturnItemResponse(ResponseBase):
    return_item_id: int
    order_item_id: int
    quantity: int
    reason: Optional[str] = None
    item_status: Optional[str] = None


class ReturnResponse(ResponseBase):
    return_id: int
    order_id: int
    reason: Optional[str] = None
    return_status: ReturnStatus
    customer_notes: Optional[str] = None
    requested_at: datetime
    updated_at: datetime
    items: List[ReturnItemResponse] = Field(default_factory=list)


class RefundResponse(ResponseBase):
    refund_id: int
    payment_id: int
    order_id: int
    refund_amount: PositiveMoney
    refund_reason: Optional[str] = None
    refund_status: RefundStatus
    gateway_refund_id: Optional[str] = None
    requested_at: datetime
    processed_at: Optional[datetime] = None


class ShipmentResponse(ResponseBase):
    shipment_id: int
    order_id: int
    logistics_provider: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    shipment_status: Optional[str] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None


class InvoiceResponse(ResponseBase):
    invoice_id: int
    order_id: int
    invoice_number: str
    invoice_url: Optional[str] = None
    issued_at: datetime


class StorePolicyResponse(ResponseBase):
    policy_id: int
    policy_type: PolicyType
    title: str
    content: str
    version: str
    is_active: bool
    updated_at: datetime


class StorePolicyCreate(StrictRequest):
    policy_type: PolicyType
    title: SingleLine255
    content: MultiLine20000
    version: SingleLine50
    is_active: bool = True


class StorePolicyUpdate(PartialUpdate):
    title: Optional[SingleLine255] = None
    content: Optional[MultiLine20000] = None
    is_active: Optional[bool] = None


class CouponUsageResponse(ResponseBase):
    coupon_usage_id: int
    coupon_id: int
    order_id: int
    discount_amount: Decimal
    used_at: datetime


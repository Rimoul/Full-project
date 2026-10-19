"""
Seazonal Swaad - SQLAlchemy models

Built from "Seazonal Swaad Database Table Reference".
Tables are grouped by implementation phase. Phase 1 is the core you need
for catalogue + checkout; Phases 2 and 3 can stay in the file but you only
need to create/migrate them when their UI becomes functional.

Money  -> Numeric(10, 2), never Float.
Times  -> timezone-aware, stored in UTC (server default = now()).
Soft delete -> `deleted_at` is NULL while the record is active.
"""

import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AddressType(str, enum.Enum):
    Home = "Home"
    Office = "Office"
    Other = "Other"


class WeightUnit(str, enum.Enum):
    g = "g"
    kg = "kg"


class MediaType(str, enum.Enum):
    image = "image"
    video = "video"


class OrderStatus(str, enum.Enum):
    Pending = "Pending"
    Confirmed = "Confirmed"
    Processing = "Processing"
    Packed = "Packed"
    Shipped = "Shipped"
    Out_For_Delivery = "Out_For_Delivery"
    Delivered = "Delivered"
    Cancelled = "Cancelled"
    Return_Requested = "Return_Requested"
    Returned = "Returned"


class PaymentStatus(str, enum.Enum):
    Pending = "Pending"
    Authorized = "Authorized"
    Paid = "Paid"
    Failed = "Failed"
    Partially_Refunded = "Partially_Refunded"
    Refunded = "Refunded"


class PaymentMethod(str, enum.Enum):
    UPI = "UPI"
    Card = "Card"
    Net_Banking = "Net_Banking"
    COD = "COD"


class DiscountType(str, enum.Enum):
    Percentage = "Percentage"
    Fixed_Amount = "Fixed_Amount"


class CancellationStatus(str, enum.Enum):
    Requested = "Requested"
    Approved = "Approved"
    Rejected = "Rejected"


class ReturnStatus(str, enum.Enum):
    Requested = "Requested"
    Approved = "Approved"
    Rejected = "Rejected"
    Received = "Received"
    Completed = "Completed"


class RefundStatus(str, enum.Enum):
    Pending = "Pending"
    Processing = "Processing"
    Succeeded = "Succeeded"
    Failed = "Failed"


class PolicyType(str, enum.Enum):
    Cancellation = "Cancellation"
    Returns_Refunds = "Returns_Refunds"
    Shipping = "Shipping"
    Terms = "Terms"
    Privacy = "Privacy"


class AdminRole(str, enum.Enum):
    Owner = "Owner"
    Catalog_Manager = "Catalog_Manager"
    Order_Manager = "Order_Manager"


# ---------------------------------------------------------------------------
# Mixins
# ---------------------------------------------------------------------------

class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # NULL = active


# ===========================================================================
# PHASE 1 - Core catalogue and checkout
# ===========================================================================

# 1. Users ------------------------------------------------------------------
class User(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)  # normalize to lowercase in code
    phone_number = Column(String(20), unique=True, nullable=True)         # added later in the flow

    # Google users have no password
    password_hash = Column(String(255), nullable=True)
    # "local" (email/password) or "google"
    auth_provider = Column(String(20), default="local", nullable=False)

    # Verification status
    email_verified = Column(Boolean, default=False, nullable=False)
    mobile_verified = Column(Boolean, default=False, nullable=False)

    # Email OTP (kept from your existing auth flow)
    email_otp = Column(String(6), nullable=True)
    # Naive datetime on purpose: matches the existing OTP code that compares
    # against datetime.utcnow(). Change both together if you move to aware datetimes.
    email_otp_expires = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)

    addresses = relationship("Address", back_populates="user")
    cart_items = relationship("CartItem", back_populates="user")
    wishlist_items = relationship("WishlistItem", back_populates="user")
    orders = relationship("Order", back_populates="user")
    reviews = relationship("Review", back_populates="user")


# 2. Addresses --------------------------------------------------------------
class Address(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "addresses"

    address_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)

    address_type = Column(Enum(AddressType, name="address_type"), default=AddressType.Home, nullable=False)
    label = Column(String(100), nullable=True)               # e.g. "Uncle's House"
    recipient_name = Column(String(150), nullable=False)
    phone_number = Column(String(20), nullable=False)
    address_line = Column(String(255), nullable=False)
    landmark = Column(String(255), nullable=True)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    pin_code = Column(String(10), nullable=False)            # string keeps leading zeroes
    country = Column(String(100), default="India", nullable=False)
    latitude = Column(Numeric(9, 6), nullable=True)
    longitude = Column(Numeric(9, 6), nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="addresses")

    # RULE: at most one ACTIVE default address per user.
    # Enforce in backend logic. On PostgreSQL you can add a partial unique index:
    #   Index("uq_one_default_address_per_user", "user_id", unique=True,
    #         postgresql_where=text("is_default AND deleted_at IS NULL"))
    # (Don't add it on MySQL - the where clause is ignored and it would
    #  wrongly limit each user to one address.)


# 3. Categories -------------------------------------------------------------
class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    category_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    products = relationship("Product", secondary="product_categories", back_populates="categories")


# 4. ProductCategories (junction, many-to-many) -----------------------------
# Composite PK (product_id, category_id) also enforces UNIQUE(product_id, category_id).
product_categories = Table(
    "product_categories",
    Base.metadata,
    Column("product_id", Integer, ForeignKey("products.product_id"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.category_id"), primary_key=True),
)


# 5. Products ---------------------------------------------------------------
class Product(SoftDeleteMixin, Base):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(280), unique=True, nullable=False, index=True)
    short_description = Column(String(500), nullable=True)
    long_description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Price and stock live on ProductVariant, not here.
    categories = relationship("Category", secondary="product_categories", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product")
    media = relationship("ProductMedia", back_populates="product")
    highlights = relationship("ProductHighlight", back_populates="product")
    ingredients = relationship("ProductIngredient", back_populates="product")
    reviews = relationship("Review", back_populates="product")
    questions = relationship("ProductQuestion", back_populates="product")


# 6. ProductVariants --------------------------------------------------------
class ProductVariant(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "product_variants"

    variant_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)

    weight_value = Column(Numeric(10, 2), nullable=False)    # 250, 500, 1
    weight_unit = Column(Enum(WeightUnit, name="weight_unit"), nullable=False)
    selling_price = Column(Numeric(10, 2), nullable=False)
    original_price = Column(Numeric(10, 2), nullable=True)   # MRP; discount % is calculated, not stored
    stock_quantity = Column(Integer, default=0, nullable=False)
    sku = Column(String(64), unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    product = relationship("Product", back_populates="variants")

    __table_args__ = (
        CheckConstraint("stock_quantity >= 0", name="ck_variant_stock_non_negative"),
        CheckConstraint("selling_price >= 0", name="ck_variant_price_non_negative"),
        # Duplicate active variants of the same size: check in backend logic
        # (a plain unique constraint would block re-adding a soft-deleted size).
    )


# 7. ProductMedia -----------------------------------------------------------
class ProductMedia(TimestampMixin, Base):
    __tablename__ = "product_media"

    media_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)
    media_type = Column(Enum(MediaType, name="media_type"), default=MediaType.image, nullable=False)
    media_url = Column(Text, nullable=False)
    thumbnail_url = Column(Text, nullable=True)
    alt_text = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)

    product = relationship("Product", back_populates="media")
    # RULE: one primary image per product - enforce in backend logic
    # (or a partial unique index on PostgreSQL).


# 10. CartItems -------------------------------------------------------------
class CartItem(Base):
    __tablename__ = "cart_items"

    cart_item_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.variant_id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", back_populates="cart_items")
    variant = relationship("ProductVariant")

    __table_args__ = (
        UniqueConstraint("user_id", "variant_id", name="uq_cart_user_variant"),
        CheckConstraint("quantity > 0", name="ck_cart_quantity_positive"),
    )


# 15. Orders ----------------------------------------------------------------
class Order(Base):
    __tablename__ = "orders"

    order_id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(20), unique=True, nullable=False, index=True)  # e.g. SS1003
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)

    # Immutable shipping snapshot (copied from Address at checkout)
    shipping_name = Column(String(150), nullable=False)
    shipping_phone = Column(String(20), nullable=False)
    shipping_address_line = Column(String(255), nullable=False)
    shipping_landmark = Column(String(255), nullable=True)
    shipping_city = Column(String(100), nullable=False)
    shipping_state = Column(String(100), nullable=False)
    shipping_pin_code = Column(String(10), nullable=False)
    shipping_country = Column(String(100), default="India", nullable=False)

    # Money (always calculated on the backend)
    subtotal = Column(Numeric(10, 2), nullable=False)
    discount_applied = Column(Numeric(10, 2), default=0, nullable=False)
    delivery_charge = Column(Numeric(10, 2), default=0, nullable=False)
    tax_amount = Column(Numeric(10, 2), default=0, nullable=False)
    total_amount = Column(Numeric(10, 2), nullable=False)  # amount payable, not proof of payment
    currency = Column(String(3), default="INR", nullable=False)

    current_status = Column(Enum(OrderStatus, name="order_status"), default=OrderStatus.Pending, nullable=False, index=True)
    payment_status = Column(Enum(PaymentStatus, name="order_payment_status"), default=PaymentStatus.Pending, nullable=False)
    expected_delivery = Column(Date, nullable=True)

    # Policy acceptance at checkout
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    accepted_terms_version = Column(String(50), nullable=True)
    accepted_privacy_version = Column(String(50), nullable=True)

    placed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")
    payments = relationship("Payment", back_populates="order")
    tracking = relationship("OrderTracking", back_populates="order", order_by="OrderTracking.logged_at")

    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="ck_order_subtotal_non_negative"),
        CheckConstraint("total_amount >= 0", name="ck_order_total_non_negative"),
    )


# 16. OrderItems ------------------------------------------------------------
class OrderItem(Base):
    __tablename__ = "order_items"

    order_item_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    # Nullable only in case you ever hard-delete; with soft-delete these stay populated.
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=True)
    variant_id = Column(Integer, ForeignKey("product_variants.variant_id"), nullable=True)

    # Snapshots - must never change after purchase
    snapshot_name = Column(String(255), nullable=False)
    snapshot_weight = Column(String(50), nullable=False)       # e.g. "500 g"
    snapshot_image = Column(Text, nullable=True)
    snapshot_category = Column(String(100), nullable=True)

    purchased_price = Column(Numeric(10, 2), nullable=False)   # unit price at checkout
    original_price = Column(Numeric(10, 2), nullable=True)
    quantity = Column(Integer, nullable=False)
    discount_amount = Column(Numeric(10, 2), default=0, nullable=False)  # for the ENTIRE line
    line_total = Column(Numeric(10, 2), nullable=False)        # after line discount

    order = relationship("Order", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_item_quantity_positive"),
    )


# 17. Payments (one row per payment ATTEMPT) --------------------------------
class Payment(Base):
    __tablename__ = "payments"

    payment_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)

    payment_method = Column(Enum(PaymentMethod, name="payment_method"), nullable=False)
    payment_provider = Column(String(50), nullable=True)
    payment_status = Column(Enum(PaymentStatus, name="payment_attempt_status"), default=PaymentStatus.Pending, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="INR", nullable=False)

    transaction_id = Column(String(100), nullable=True)
    gateway_order_id = Column(String(100), nullable=True, index=True)
    gateway_payment_id = Column(String(100), nullable=True, index=True)
    failure_reason = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    order = relationship("Order", back_populates="payments")
    # NEVER store card numbers, CVVs, UPI PINs or banking credentials.


# 18. OrderTracking (status audit trail) ------------------------------------
class OrderTracking(Base):
    __tablename__ = "order_tracking"

    tracking_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    status_step = Column(Enum(OrderStatus, name="tracking_status_step"), nullable=False)
    description = Column(String(255), nullable=True)   # customer-facing message
    location = Column(String(150), nullable=True)
    updated_by = Column(String(100), nullable=True)    # "system", admin id/name, delivery partner
    logged_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("Order", back_populates="tracking")
    # Every status change = a NEW row. Never overwrite old events.


# ===========================================================================
# PHASE 2 - Features already visible in the UI
# ===========================================================================

# 8. ProductHighlights ------------------------------------------------------
class ProductHighlight(TimestampMixin, Base):
    __tablename__ = "product_highlights"

    highlight_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)
    highlight_text = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    product = relationship("Product", back_populates="highlights")


# 9. ProductIngredients -----------------------------------------------------
class ProductIngredient(TimestampMixin, Base):
    __tablename__ = "product_ingredients"

    ingredient_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)
    ingredient_name = Column(String(150), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    product = relationship("Product", back_populates="ingredients")


# 11. WishlistItems ---------------------------------------------------------
class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    wishlist_item_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="wishlist_items")
    product = relationship("Product")

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
    )


# 12. Reviews ---------------------------------------------------------------
class Review(TimestampMixin, Base):
    __tablename__ = "reviews"

    review_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    # Optional only if reviews without purchase are allowed
    order_item_id = Column(Integer, ForeignKey("order_items.order_item_id"), nullable=True)

    rating = Column(Integer, nullable=False)
    review_text = Column(Text, nullable=True)
    is_verified_purchase = Column(Boolean, default=False, nullable=False)  # set by backend only
    is_visible = Column(Boolean, default=True, nullable=False)             # moderation toggle

    product = relationship("Product", back_populates="reviews")
    user = relationship("User", back_populates="reviews")
    order_item = relationship("OrderItem")

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating_range"),
        # Pick ONE rule and enforce it, e.g. one review per user per product:
        #   UniqueConstraint("user_id", "product_id", name="uq_review_user_product")
        # or one review per purchased item:
        #   UniqueConstraint("order_item_id", name="uq_review_order_item")
    )


# 13. ProductQuestions ------------------------------------------------------
class ProductQuestion(TimestampMixin, Base):
    __tablename__ = "product_questions"

    question_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    question_text = Column(Text, nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)

    product = relationship("Product", back_populates="questions")
    user = relationship("User")
    answers = relationship("ProductAnswer", back_populates="question")


# 14. ProductAnswers --------------------------------------------------------
class ProductAnswer(TimestampMixin, Base):
    __tablename__ = "product_answers"

    answer_id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("product_questions.question_id"), nullable=False, index=True)
    # Points to Users. If admins live in a separate Admins table, add a
    # separate admin_id column instead of storing admin ids here.
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    answer_text = Column(Text, nullable=False)
    is_official = Column(Boolean, default=False, nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)

    question = relationship("ProductQuestion", back_populates="answers")
    user = relationship("User")


# 19. Coupons ---------------------------------------------------------------
class Coupon(TimestampMixin, Base):
    __tablename__ = "coupons"

    coupon_id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # normalize case in code
    description = Column(String(255), nullable=True)
    discount_type = Column(Enum(DiscountType, name="discount_type"), nullable=False)
    discount_value = Column(Numeric(10, 2), nullable=False)
    minimum_order_amount = Column(Numeric(10, 2), nullable=True)
    maximum_discount = Column(Numeric(10, 2), nullable=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    usage_limit = Column(Integer, nullable=True)
    per_user_limit = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    usages = relationship("CouponUsage", back_populates="coupon")

    __table_args__ = (
        CheckConstraint("discount_value >= 0", name="ck_coupon_value_non_negative"),
    )


# 20. CouponUsages ----------------------------------------------------------
class CouponUsage(Base):
    __tablename__ = "coupon_usages"

    coupon_usage_id = Column(Integer, primary_key=True, index=True)
    coupon_id = Column(Integer, ForeignKey("coupons.coupon_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False)
    discount_amount = Column(Numeric(10, 2), nullable=False)
    used_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    coupon = relationship("Coupon", back_populates="usages")
    user = relationship("User")
    order = relationship("Order")


# 21. OrderCancellations ----------------------------------------------------
class OrderCancellation(Base):
    __tablename__ = "order_cancellations"

    cancellation_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    requested_by_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)  # NULL if admin initiated
    reason = Column(String(255), nullable=True)
    cancellation_status = Column(
        Enum(CancellationStatus, name="cancellation_status"),
        default=CancellationStatus.Requested,
        nullable=False,
    )
    refund_required = Column(Boolean, default=False, nullable=False)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    processed_by = Column(String(100), nullable=True)

    order = relationship("Order")
    requested_by = relationship("User")


# ===========================================================================
# PHASE 3 - After policies and operational workflow are defined
# ===========================================================================

# 22. Returns ---------------------------------------------------------------
class Return(Base):
    __tablename__ = "returns"

    return_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    reason = Column(String(255), nullable=True)
    return_status = Column(Enum(ReturnStatus, name="return_status"), default=ReturnStatus.Requested, nullable=False)
    customer_notes = Column(Text, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    order = relationship("Order")
    user = relationship("User")
    items = relationship("ReturnItem", back_populates="return_request")


# 23. ReturnItems (item-level returns) --------------------------------------
class ReturnItem(Base):
    __tablename__ = "return_items"

    return_item_id = Column(Integer, primary_key=True, index=True)
    return_id = Column(Integer, ForeignKey("returns.return_id"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.order_item_id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=True)
    item_status = Column(String(50), nullable=True)

    return_request = relationship("Return", back_populates="items")
    order_item = relationship("OrderItem")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_return_item_quantity_positive"),
    )


# 24. Refunds ---------------------------------------------------------------
class Refund(Base):
    __tablename__ = "refunds"

    refund_id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.payment_id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    refund_amount = Column(Numeric(10, 2), nullable=False)
    refund_reason = Column(String(255), nullable=True)
    refund_status = Column(Enum(RefundStatus, name="refund_status"), default=RefundStatus.Pending, nullable=False)
    gateway_refund_id = Column(String(100), nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)

    payment = relationship("Payment")
    order = relationship("Order")

    __table_args__ = (
        CheckConstraint("refund_amount > 0", name="ck_refund_amount_positive"),
    )


# 25. Shipments -------------------------------------------------------------
class Shipment(TimestampMixin, Base):
    __tablename__ = "shipments"

    shipment_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    logistics_provider = Column(String(100), nullable=True)
    tracking_number = Column(String(100), nullable=True, index=True)
    tracking_url = Column(Text, nullable=True)
    shipment_status = Column(String(50), nullable=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    order = relationship("Order")


# 26. Invoices --------------------------------------------------------------
class Invoice(Base):
    __tablename__ = "invoices"

    invoice_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    invoice_number = Column(String(50), unique=True, nullable=False)
    invoice_url = Column(Text, nullable=True)
    issued_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("Order")


# 27. StorePolicies ---------------------------------------------------------
class StorePolicy(Base):
    __tablename__ = "store_policies"

    policy_id = Column(Integer, primary_key=True, index=True)
    policy_type = Column(Enum(PolicyType, name="policy_type"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    version = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("policy_type", "version", name="uq_policy_type_version"),
    )


# 28. Admins (OPTIONAL) -----------------------------------------------------
# Use this only if admins are separate from Users. If you'd rather have admins
# be normal users with a role, delete this class and add a `role` column to User.
class Admin(TimestampMixin, Base):
    __tablename__ = "admins"

    admin_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(AdminRole, name="admin_role"), default=AdminRole.Catalog_Manager, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

"""Seazonal Swaad API entry point using models2.py + schemas3.py.

Database tables are intentionally NOT auto-created during app import. Run
`python init_db.py` against a fresh/test database after reviewing .env.
"""
import os
from decimal import Decimal
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

import models3 as models
import schemas4 as schemas
import auth_models  # registers auth_sessions/auth_challenges/auth_rate_limits on Base.metadata
from auth_routes import router as auth_router, get_current_session_user, require_trusted_origin
from database import get_db

app = FastAPI(title="Seazonal Swaad API", version="0.1.0")

_default_origins = "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:5501,http://localhost:5501"
FRONTEND_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", _default_origins).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.include_router(auth_router)


def _primary_image(product: models.Product) -> str | None:
    media = list(product.media or [])
    primary = next((m for m in media if m.is_primary), None)
    if primary:
        return primary.media_url
    media.sort(key=lambda m: (m.sort_order, m.media_id))
    return media[0].media_url if media else None


def _product_payload(product: models.Product, *, detail: bool = False) -> dict[str, Any]:
    variants = [v for v in (product.variants or []) if v.is_active and v.deleted_at is None]
    variants.sort(key=lambda v: (v.weight_value, v.variant_id))
    visible_reviews = [r for r in (product.reviews or []) if r.is_visible]
    average_rating = (
        round(sum(r.rating for r in visible_reviews) / len(visible_reviews), 2)
        if visible_reviews else None
    )
    data: dict[str, Any] = {
        "product_id": product.product_id,
        "name": product.name,
        "slug": product.slug,
        "short_description": product.short_description,
        "primary_image_url": _primary_image(product),
        "average_rating": average_rating,
        "review_count": len(visible_reviews),
        "variants": variants,
    }
    if detail:
        data.update({
            "long_description": product.long_description,
            "categories": [c for c in (product.categories or []) if c.is_active],
            "media": sorted(product.media or [], key=lambda m: (m.sort_order, m.media_id)),
            "highlights": sorted(
                [h for h in (product.highlights or []) if h.is_active],
                key=lambda h: (h.sort_order, h.highlight_id),
            ),
            "ingredients": sorted(
                [i for i in (product.ingredients or []) if i.is_active],
                key=lambda i: (i.sort_order, i.ingredient_id),
            ),
        })
    return data


@app.get("/")
def root():
    return {"name": "Seazonal Swaad API", "status": "online"}


@app.get("/test-db")
def test_database_connection(db: Session = Depends(get_db)):
    # A tiny query confirms that the configured database is reachable.
    db.execute(text("SELECT 1"))
    return {"message": "Successfully connected to PostgreSQL!"}


@app.get("/products/", response_model=list[schemas.ProductSummary])
def read_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    products = (
        db.query(models.Product)
        .filter(models.Product.is_active.is_(True), models.Product.deleted_at.is_(None))
        .options(
            selectinload(models.Product.variants),
            selectinload(models.Product.media),
            selectinload(models.Product.reviews),
        )
        .order_by(models.Product.added_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [schemas.ProductSummary.model_validate(_product_payload(p)) for p in products]


@app.get("/products/{product_id}", response_model=schemas.ProductDetail)
def read_single_product(product_id: int, db: Session = Depends(get_db)):
    product = (
        db.query(models.Product)
        .filter(
            models.Product.product_id == product_id,
            models.Product.is_active.is_(True),
            models.Product.deleted_at.is_(None),
        )
        .options(
            selectinload(models.Product.variants),
            selectinload(models.Product.media),
            selectinload(models.Product.categories),
            selectinload(models.Product.highlights),
            selectinload(models.Product.ingredients),
            selectinload(models.Product.reviews),
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return schemas.ProductDetail.model_validate(_product_payload(product, detail=True))


# Product creation is deliberately not public. Add it back only behind a separately
# authenticated/authorized admin endpoint; the old implementation allowed anonymous writes.


@app.get("/cart/", response_model=schemas.CartResponse)
def get_my_cart(
    user: models.User = Depends(get_current_session_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(models.CartItem)
        .filter(models.CartItem.user_id == user.user_id)
        .options(selectinload(models.CartItem.variant).selectinload(models.ProductVariant.product))
        .order_by(models.CartItem.added_at.desc())
        .all()
    )
    return schemas.CartResponse(items=items)


@app.post("/cart/", response_model=schemas.CartItemResponse)
def add_cart_item(
    payload: schemas.CartItemCreate,
    request: Request,
    user: models.User = Depends(get_current_session_user),
    db: Session = Depends(get_db),
):
    require_trusted_origin(request)
    variant = (
        db.query(models.ProductVariant)
        .join(models.Product)
        .filter(
            models.ProductVariant.variant_id == payload.variant_id,
            models.ProductVariant.is_active.is_(True),
            models.ProductVariant.deleted_at.is_(None),
            models.Product.is_active.is_(True),
            models.Product.deleted_at.is_(None),
        )
        .first()
    )
    if not variant:
        raise HTTPException(status_code=404, detail="Product option not found")
    existing = db.query(models.CartItem).filter(
        models.CartItem.user_id == user.user_id,
        models.CartItem.variant_id == variant.variant_id,
    ).first()
    new_quantity = payload.quantity + (existing.quantity if existing else 0)
    if new_quantity > variant.stock_quantity:
        raise HTTPException(status_code=400, detail=f"Only {variant.stock_quantity} currently in stock.")
    if new_quantity > schemas.MAX_CART_QTY_PER_ITEM:
        raise HTTPException(status_code=400, detail=f"You can add up to {schemas.MAX_CART_QTY_PER_ITEM} of one option.")

    if existing:
        existing.quantity = new_quantity
        item = existing
    else:
        item = models.CartItem(user_id=user.user_id, variant_id=variant.variant_id, quantity=new_quantity)
        db.add(item)
    db.commit()
    db.refresh(item)
    # Load relations for the response model.
    db.refresh(variant)
    return item


@app.patch("/cart/{cart_item_id}", response_model=schemas.CartItemResponse)
def update_cart_item(
    cart_item_id: int,
    payload: schemas.CartItemUpdate,
    request: Request,
    user: models.User = Depends(get_current_session_user),
    db: Session = Depends(get_db),
):
    require_trusted_origin(request)
    item = db.query(models.CartItem).filter(
        models.CartItem.cart_item_id == cart_item_id,
        models.CartItem.user_id == user.user_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if not item.variant.is_active or item.variant.deleted_at is not None:
        raise HTTPException(status_code=400, detail="This product option is unavailable.")
    if payload.quantity > item.variant.stock_quantity:
        raise HTTPException(status_code=400, detail=f"Only {item.variant.stock_quantity} currently in stock.")
    item.quantity = payload.quantity
    db.commit()
    db.refresh(item)
    return item


@app.delete("/cart/{cart_item_id}")
def delete_cart_item(
    cart_item_id: int,
    request: Request,
    user: models.User = Depends(get_current_session_user),
    db: Session = Depends(get_db),
):
    require_trusted_origin(request)
    item = db.query(models.CartItem).filter(
        models.CartItem.cart_item_id == cart_item_id,
        models.CartItem.user_id == user.user_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return {"message": "Cart item removed."}

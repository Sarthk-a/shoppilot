# ShopPilot

AI-powered agentic commerce assistant built for the
Razorpay AI Buildathon 2026 — Track 01:
AI Growth & Agentic Commerce.

## What is ShopPilot?

ShopPilot is an AI shopping agent that helps customers
discover products, build carts, receive relevant upsell
recommendations and complete purchases through Razorpay.

Unlike a traditional shopping chatbot, ShopPilot can
participate in the complete commerce workflow while
keeping financial actions bounded, explainable, gated
and auditable.

## Core Features

- Conversational product discovery
- AI-powered catalog search
- Cart building
- Contextual upselling
- Merchant-configurable upsell limits
- Merchant purchase limits
- Customer shopping preferences
- Agent authorization before upsells
- Razorpay Test Mode checkout
- Server-side payment verification
- PostgreSQL persistence
- Audit trail
- Merchant analytics
- Graceful failure handling
- Reorder / usual purchase flow

## Architecture

React
↓
FastAPI
↓
Google ADK + Gemini
↓
Catalog / Commerce / Preference Tools
↓
PostgreSQL
↓
Razorpay Test Mode

## Safety Model

AI can recommend.

AI cannot directly authorize unrestricted payments.

Every financial action passes through deterministic
application rules.

Purchase actions are:

- bounded
- explainable
- gated
- persisted
- auditable

## Example

Customer:

"I need running shoes under ₹5,000 for daily running."

ShopPilot searches the catalog and recommends
relevant products.

The customer selects a product.

ShopPilot can recommend relevant accessories within
the merchant-defined upsell limit.

The customer explicitly approves the upsell.

The final cart is reviewed before Razorpay checkout.

Payment is verified server-side before the order is
marked as paid.

## Failure Handling

If the recommendation service fails, the customer's
cart and checkout remain available.

If payment fails, the cart remains intact.

If payment verification fails, the order is not treated
as successfully paid.

## Tech Stack

Frontend:
- React
- Vite
- CSS

Backend:
- FastAPI
- Python
- Google ADK
- Gemini

Database:
- PostgreSQL
- SQLAlchemy

Payments:
- Razorpay Test Mode

## Running Locally

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
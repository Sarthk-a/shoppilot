PRODUCTS = [
    {
        "id": "shoe_001",
        "name": "ASICS Gel-Contend 9",
        "category": "running shoes",
        "brand": "ASICS",
        "price": 4299,
        "description": "Comfortable lightweight running shoe for daily training.",
        "sizes": [7, 8, 9, 10, 11],
        "stock": 18,
        "tags": ["running", "daily", "comfortable", "lightweight"],
    },
    {
        "id": "shoe_002",
        "name": "Nike Revolution 7",
        "category": "running shoes",
        "brand": "Nike",
        "price": 3499,
        "description": "Lightweight everyday running shoe with responsive cushioning.",
        "sizes": [6, 7, 8, 9, 10],
        "stock": 24,
        "tags": ["running", "daily", "lightweight", "budget"],
    },
    {
        "id": "shoe_003",
        "name": "Puma Velocity Nitro",
        "category": "running shoes",
        "brand": "Puma",
        "price": 4799,
        "description": "Performance-focused running shoe designed for comfortable daily runs.",
        "sizes": [7, 8, 9, 10],
        "stock": 12,
        "tags": ["running", "performance", "comfortable"],
    },
    {
        "id": "sock_001",
        "name": "Performance Running Socks",
        "category": "running accessories",
        "brand": "ShopPilot",
        "price": 399,
        "description": "Breathable moisture-wicking socks designed for running.",
        "sizes": ["S", "M", "L"],
        "stock": 50,
        "tags": ["running", "accessory", "socks"],
    },
    {
        "id": "bottle_001",
        "name": "Insulated Sports Bottle",
        "category": "running accessories",
        "brand": "ShopPilot",
        "price": 499,
        "description": "Insulated reusable bottle for workouts and running.",
        "sizes": ["750ml"],
        "stock": 30,
        "tags": ["running", "hydration", "accessory"],
    },
]


def search_products(query: str, max_price: int | None = None):
    query_words = query.lower().split()

    results = []

    for product in PRODUCTS:
        searchable_text = " ".join(
            [
                product["name"],
                product["category"],
                product["brand"],
                product["description"],
                " ".join(product["tags"]),
            ]
        ).lower()

        score = sum(
            1 for word in query_words
            if word in searchable_text
        )

        if score == 0:
            continue

        if max_price is not None and product["price"] > max_price:
            continue

        results.append(
            {
                "id": product["id"],
                "name": product["name"],
                "brand": product["brand"],
                "price": product["price"],
                "description": product["description"],
                "stock": product["stock"],
                "sizes": product["sizes"],
                "category": product["category"],
                "relevance_score": score,
            }
        )

    results.sort(
        key=lambda product: product["relevance_score"],
        reverse=True,
    )

    return results[:3]
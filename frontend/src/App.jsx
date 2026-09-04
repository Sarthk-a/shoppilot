import { useEffect, useState } from "react";
import "./App.css";
import MerchantDashboard from "./MerchantDashboard";

const PAYMENT_STATES = {
  IDLE: "IDLE",
  CREATING_ORDER: "CREATING_ORDER",
  CHECKOUT_OPEN: "CHECKOUT_OPEN",
  PAID: "PAID",
  FAILED: "FAILED",
};

function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hey! What are you shopping for today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const [paymentStatus, setPaymentStatus] =
    useState(PAYMENT_STATES.IDLE);

  const [maxPurchase, setMaxPurchase] = useState(5000);
  const [maxUpsell, setMaxUpsell] = useState(500);
  const [autoUpsell, setAutoUpsell] = useState(true);
  const [paymentConfirmation, setPaymentConfirmation] = useState(true);
  const [pendingAuthorization, setPendingAuthorization] = useState(null);

  // ---------------------------------------
  // Load merchant settings
  // ---------------------------------------
  const loadMerchantSettings = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/merchant/settings"
      );

      if (!response.ok) {
        throw new Error("Failed to load merchant settings");
      }

      const data = await response.json();

      setMaxPurchase(data.max_purchase);
      setMaxUpsell(data.max_upsell);
      setAutoUpsell(data.auto_upsell);
      setPaymentConfirmation(data.payment_confirmation);
    } catch (error) {
      console.error("SETTINGS LOAD ERROR:", error);
    }
  };

  // ---------------------------------------
  // Load settings on startup
  // ---------------------------------------
  useEffect(() => {
    loadMerchantSettings();
  }, []);

  // ---------------------------------------
  // Save merchant settings
  // ---------------------------------------
  const saveMerchantSettings = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/merchant/settings",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            max_purchase: maxPurchase,
            max_upsell: maxUpsell,
            auto_upsell: autoUpsell,
            payment_confirmation: paymentConfirmation,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to save rules."
        );
      }

      setRulesOpen(false);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Your ShopPilot rules have been updated.",
        },
      ]);
    } catch (error) {
      console.error("SETTINGS SAVE ERROR:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I couldn't save those rules right now.",
        },
      ]);
    }
  };

  // ---------------------------------------
  // Send chat
  // ---------------------------------------
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: userMessage,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      setSessionId(data.session_id);
      setProducts(data.products || []);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.response,
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------
  // Enter key
  // ---------------------------------------
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  };

  // ---------------------------------------
  // Add to cart
  // ---------------------------------------
  const addToCart = (product, showMessage = true) => {

    if (
    product.stock !== undefined &&
    product.stock <= 0
  ) {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `${product.name} is currently out of stock.`,
      },
    ]);

    return;
  }
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.id === product.id
      );

      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          ...product,
          quantity: 1,
        },
      ];
    });

    if (showMessage) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `${product.name} added to your cart.`,
        },
      ]);
    }
  };

  // ---------------------------------------
  // Remove from cart
  // ---------------------------------------
  const removeFromCart = (productId) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // ---------------------------------------
  // Cart count & total
  // ---------------------------------------
  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  // ---------------------------------------
  // Get accessories
  // ---------------------------------------
  const getAccessories = async () => {
    if (cart.length === 0) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:8000/upsell",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: cart.map((item) => ({
              product_id: item.id,
              quantity: item.quantity,
            })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
          "Unable to find accessories"
        );
      }

      const recommendations =
        data.recommendations || [];

      setProducts((recommendations  || []).map((item) => ({
    ...item.product,
    reason: item.reason,
  }))
  );

      if (data.fallback) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              "I couldn't load recommendations right now, " +
              "but your cart is safe and checkout is still available.",
          },
        ]);

        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            recommendations.length > 0
              ? `I found a few useful additions within your ₹${maxUpsell} upsell limit.`
              : "I couldn't find any useful additions within your current upsell limit.",
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            "I couldn't find suitable accessories right now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------
  // Open checkout review
  // ---------------------------------------
  const openReview = () => {
    if (cart.length === 0) return;

    if (cartTotal > maxPurchase) {
      alert(
        `Your cart exceeds your ₹${maxPurchase.toLocaleString(
          "en-IN"
        )} purchase limit.`
      );
      return;
    }

    setCartOpen(false);
    setReviewOpen(true);
  };

  // ---------------------------------------
  // Authorize upsell
  // ---------------------------------------
  const authorizeUpsell = async (product) => {
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:8000/authorize-upsell",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id: product.id,
            amount: product.price,
            max_upsell_limit: maxUpsell,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Authorization failed"
        );
      }

      if (!data.approved) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              data.reason ||
              `${product.name} cannot be added within the current upsell limit.`,
          },
        ]);

        return;
      }

      

      setPendingAuthorization({
        ...data,
        product: product,
      });
    } catch (error) {
      console.error("AUTHORIZE ERROR:", error);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------
  // Approve upsell
  // ---------------------------------------
  const approveUpsell = async () => {
    if (!pendingAuthorization) return;

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:8000/approve-upsell",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            authorization_id:
              pendingAuthorization.authorization_id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to approve upsell"
        );
      }

      if (!data.approved) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              data.reason ||
              "This addition was not approved.",
          },
        ]);

        return;
      }

      // Add approved product exactly once
      addToCart(
        pendingAuthorization.product,
        false
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            `${pendingAuthorization.product.name} ` +
            `has been added to your cart.`,
        },
      ]);

      setPendingAuthorization(null);
    } catch (error) {
      console.error("APPROVE UPSELL ERROR:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I couldn't add that item right now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------
  // Load Razorpay Checkout Script
  // ---------------------------------------
  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (document.getElementById("razorpay-script")) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });
  };

  // ---------------------------------------
  // Handle Payment
  // ---------------------------------------
  const handleCheckout = async () => {
     if (loading || cart.length === 0) {
    return;
  }
    setPaymentStatus(PAYMENT_STATES.CREATING_ORDER);

    try {
      const res = await fetch(
        "http://localhost:8000/create-order",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: cart.map((item) => ({
              product_id: item.id,
              quantity: item.quantity,
            })),
          }),
        }
      );

      const orderData = await res.json();

      if (!res.ok) {
        throw new Error(
          orderData.detail ||
          "Failed to create order"
        );
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount * 100,
        currency: "INR",
        name: "ShopPilot",
        description: "Order Checkout",
        order_id: orderData.razorpay_order_id,

        handler: async function (response) {
          try {
            const verifyRes = await fetch(
              "http://localhost:8000/verify-payment",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  razorpay_order_id:
                    response.razorpay_order_id,
                  razorpay_payment_id:
                    response.razorpay_payment_id,
                  razorpay_signature:
                    response.razorpay_signature,
                }),
              }
            );

            const verifyData =
              await verifyRes.json();

            if (
              verifyRes.ok &&
              verifyData.success
            ) {
              setPaymentStatus(
                PAYMENT_STATES.PAID
              );

              setCart([]);

              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  text:
                    `Payment verified. Your ₹${verifyData.amount.toLocaleString(
                      "en-IN"
                    )} order is confirmed.`,
                },
              ]);
            } else {
              setPaymentStatus(
                PAYMENT_STATES.FAILED
              );

              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  text:
                    "Payment was received, but I couldn't verify it. Please do not retry immediately.",
                },
              ]);
            }
          } catch (error) {
            console.error(
              "Verification error:",
              error
            );

            setPaymentStatus(
              PAYMENT_STATES.FAILED
            );
          }
        },

        prefill: {
          name: "Customer",
          email: "customer@example.com",
        },

        theme: {
          color: "#3399cc",
        },
      };

      setPaymentStatus(
        PAYMENT_STATES.CHECKOUT_OPEN
      );

      const rzp =
        new window.Razorpay(options);

      rzp.on(
        "payment.failed",
        function () {
          setPaymentStatus(
            PAYMENT_STATES.FAILED
          );

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text:
                "The payment failed. Your cart is still intact, so you can try again.",
            },
          ]);
        }
      );

      rzp.open();
    } catch (err) {
      console.error(
        "Checkout error:",
        err
      );

      setPaymentStatus(
        PAYMENT_STATES.FAILED
      );
    }
  };

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="logo">
          ShopPilot
        </div>

        <div className="header-actions">
          <button
            className="rules-button"
            onClick={() =>
              setDashboardOpen(true)
            }
          >
            Dashboard
          </button>
          

          <button
            className="rules-button"
            onClick={() =>
              setRulesOpen(true)
            }
          >
            Rules
          </button>

          <button
            className="cart-button"
            onClick={() =>
              setCartOpen(true)
            }
          >
            🛒 Cart

            {cartCount > 0 && (
              <span className="cart-count">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="main">
        <section className="hero">
          <div className="eyebrow">
            AI SHOPPING AGENT
          </div>

          <h1>
            What are you looking for?
          </h1>

          <p>
            Tell ShopPilot what you need.
            I'll find the right products
            for you.
          </p>
        </section>

        {/* CHAT CONTAINER */}
        <div className="chat-container">
          <div className="messages">
            {messages.map(
              (message, index) => (
                <div
                  key={index}
                  className={`message ${message.role}`}
                >
                  <div className="message-content">
                    {message.text}
                  </div>
                </div>
              )
            )}

            

            {loading && (
              <div className="message assistant">
                <div className="message-content thinking">
                  Thinking...
                </div>
              </div>
            )}

            {/* AUTHORIZATION */}
            {pendingAuthorization && (
              <div className="authorization-card">
                <div className="authorization-label">
                  SHOPPILOT AUTHORIZATION
                </div>

                <h3>
                  Add this to your cart?
                </h3>

                <div className="authorization-product">
                  <div>
                    <strong>
                      {
                        pendingAuthorization
                          .product.name
                      }
                    </strong>

                    <span>
                      {
                        pendingAuthorization
                          .product.description
                      }
                    </span>
                  </div>

                  <strong>
                    ₹
                    {pendingAuthorization.amount.toLocaleString(
                      "en-IN"
                    )}
                  </strong>
                </div>

                <div className="authorization-reason">
                  ✓{" "}
                  {
                    pendingAuthorization.reason
                  }
                </div>

                <div className="authorization-actions">
                  <button
                    onClick={approveUpsell}
                    disabled={loading}
                  >
                    {loading
                      ? "Approving..."
                      : `Approve ₹${pendingAuthorization.amount}`}
                  </button>

                  <button
                    onClick={() =>
                      setPendingAuthorization(null)
                    }
                    disabled={loading}
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}

            {/* PRODUCTS */}
            {products.length > 0 && (
              <>
                {products.some(
                  (product) =>
                    product.category ===
                    "running accessories"
                ) && (
                  <div className="recommendation-label">
                    ✦ Useful recommendations from
                    ShopPilot
                  </div>
                )}

                <div className="product-grid">
                  {products.map(
                    (product) => (
                      <div
                        className="product-card"
                        key={product.id}
                      >
                        <div className="product-brand">
                          {product.brand}
                        </div>

                        <h3>
                          {product.name}
                        </h3>

                        <p>
                          {product.description}
                        </p>

                        {product.reason && (
                          <div className="product-reason">
                            ✦ {product.reason}
                          </div>
                        )}

                        <div className="product-bottom">
                          <strong>
                            ₹
                            {product.price.toLocaleString(
                              "en-IN"
                            )}
                          </strong>

                          <button
                            onClick={() =>
                              product.category ===
                              "running accessories"
                                ? authorizeUpsell(
                                    product
                                  )
                                : addToCart(
                                    product
                                  )
                            }
                          >
                            {product.category ===
                            "running accessories"
                              ? "Add with ShopPilot"
                              : "Add to cart"}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
          </div>

          {/* EMPTY CART */}
          {cart.length === 0 && (
            <div className="cart-empty">
              <strong>
                Your cart is empty
              </strong>

              <span>
                Tell ShopPilot what you're
                looking for.
              </span>
            </div>
          )}

          {/* CHECKOUT SECTION */}
          {cart.length > 0 && (
            <div className="checkout-section">
              <div className="checkout-total">
                <span>Total</span>

                <strong>
                  ₹
                  {cart
                    .reduce(
                      (total, item) =>
                        total +
                        item.price *
                          item.quantity,
                      0
                    )
                    .toLocaleString(
                      "en-IN"
                    )}
                </strong>
              </div>

              <button
                className="checkout-button"
                onClick={handleCheckout}
                disabled={loading}
              >
                {loading
                  ? "Processing..."
                  : "Continue to payment"}
              </button>
            </div>
          )}

          {/* CART PREVIEW */}
          {cart.length > 0 && (
            <div className="cart-preview">
              <div className="cart-preview-header">
                <strong>
                  Your cart
                </strong>

                <span>
                  ₹
                  {cartTotal.toLocaleString(
                    "en-IN"
                  )}
                </span>
              </div>

              {cart.map((item) => (
                <div
                  className="cart-item"
                  key={item.id}
                >
                  <div>
                    <strong>
                      {item.name}
                    </strong>

                    <span>
                      × {item.quantity}
                    </span>
                  </div>

                  <span>
                    ₹
                    {(
                      item.price *
                      item.quantity
                    ).toLocaleString(
                      "en-IN"
                    )}
                  </span>
                </div>
              ))}

              <button
                className="upsell-button"
                onClick={getAccessories}
                disabled={loading}
              >
                ✦ Find useful additions
              </button>
            </div>
          )}

          {/* SMART ACTION */}
          {cart.length > 0 && (
            <div className="smart-action">
              <div>
                <strong>
                  Want anything else?
                </strong>

                <span>
                  I can find useful accessories
                  within your ₹{maxUpsell} limit.
                </span>
              </div>

              <button
                onClick={getAccessories}
                disabled={loading}
              >
                Find accessories
              </button>
            </div>
          )}

          {/* INPUT */}
          <div className="suggested-prompts">
            <button
              onClick={() =>
                setInput(
                  `I need running shoes under ₹${maxPurchase}`
                )
              }
            >
              Running shoes under ₹{maxPurchase}
            </button>

            <button
              onClick={() =>
                setInput(
                  "Find something useful for my running"
                )
              }
            >
              Find useful accessories
            </button>

            <button
              onClick={() =>
                setInput(
                  "What is in my cart?"
                )
              }
            >
              Check my cart
            </button>
          </div>

          <div className="input-container">
            <input
              type="text"
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder={`Try "running shoes under ₹${maxUpsell}"`}
              disabled={loading}
            />

            <button
              onClick={sendMessage}
              disabled={loading}
            >
              →
            </button>
          </div>
        </div>
      </main>

      {/* CART DRAWER */}
      {cartOpen && (
        <div
          className="overlay"
          onClick={() =>
            setCartOpen(false)
          }
        >
          <aside
            className="drawer"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="drawer-header">
              <h2>Your Cart</h2>

              <button
                className="close-button"
                onClick={() =>
                  setCartOpen(false)
                }
              >
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart">
                Your cart is empty.
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <div
                      className="cart-item"
                      key={item.id}
                    >
                      <div>
                        <span className="cart-brand">
                          {item.brand}
                        </span>

                        <h3>
                          {item.name}
                        </h3>

                        <strong>
                          ₹
                          {item.price.toLocaleString(
                            "en-IN"
                          )}
                        </strong>
                      </div>

                      <div className="quantity">
                        <button
                          onClick={() =>
                            removeFromCart(
                              item.id
                            )
                          }
                        >
                          −
                        </button>

                        <span>
                          {item.quantity}
                        </span>

                        <button
                          onClick={() => {
                            if (
                              item.stock !== undefined &&
                              item.quantity >= item.stock
                            ) {
                              return;
                            }

                            addToCart(item);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-summary">
                  <div>
                    <span>
                      Subtotal
                    </span>

                    <strong>
                      ₹
                      {cartTotal.toLocaleString(
                        "en-IN"
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Purchase limit
                    </span>

                    <span>
                      ₹
                      {maxPurchase.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                  </div>
                </div>

                <button
                  className="checkout-button"
                  onClick={openReview}
                >
                  Review & Checkout
                </button>
              </>
            )}
          </aside>
        </div>
      )}

      {/* RULES MODAL */}
      {rulesOpen && (
        <div
          className="overlay"
          onClick={() =>
            setRulesOpen(false)
          }
        >
          <div
            className="rules-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">
                  AGENT CONTROL
                </span>

                <h2>
                  ShopPilot Rules
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setRulesOpen(false)
                }
              >
                ×
              </button>
            </div>

            <div className="rule">
              <div>
                <strong>
                  Maximum purchase
                </strong>

                <span>
                  ShopPilot cannot exceed
                  this amount.
                </span>
              </div>

              <div className="rule-input">
                ₹

                <input
                  type="number"
                  value={maxPurchase}
                  onChange={(event) =>
                    setMaxPurchase(
                      Number(
                        event.target.value
                      )
                    )
                  }
                />
              </div>
            </div>

            <div className="rule">
              <div>
                <strong>
                  Maximum automatic upsell
                </strong>

                <span>
                  Maximum value of
                  recommended accessories.
                </span>
              </div>

              <div className="rule-input">
                ₹

                <input
                  type="number"
                  value={maxUpsell}
                  onChange={(event) =>
                    setMaxUpsell(
                      Number(
                        event.target.value
                      )
                    )
                  }
                />
              </div>
            </div>

            <div className="rule">
              <div>
                <strong>
                  Automatic upsells
                </strong>

                <span>
                  Allow ShopPilot to
                  suggest useful additions.
                </span>
              </div>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoUpsell}
                  onChange={(event) =>
                    setAutoUpsell(
                      event.target.checked
                    )
                  }
                />

                <span className="slider" />
              </label>
            </div>

            <div className="rule">
              <div>
                <strong>
                  Payment confirmation
                </strong>

                <span>
                  Always ask before payment.
                </span>
              </div>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={paymentConfirmation}
                  onChange={(event) =>
                    setPaymentConfirmation(
                      event.target.checked
                    )
                  }
                />

                <span className="slider" />
              </label>
            </div>

            <button
              className="save-rules"
              onClick={
                saveMerchantSettings
              }
            >
              Save rules
            </button>
          </div>
        </div>
      )}

      {/* CHECKOUT REVIEW MODAL */}
      {reviewOpen && (
        <div
          className="overlay"
          onClick={() =>
            setReviewOpen(false)
          }
        >
          <div
            className="review-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">
                  FINAL REVIEW
                </span>

                <h2>
                  Review your order
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setReviewOpen(false)
                }
              >
                ×
              </button>
            </div>

            <div className="review-items">
              {cart.map((item) => (
                <div
                  className="review-item"
                  key={item.id}
                >
                  <div>
                    <strong>
                      {item.name}
                    </strong>

                    <span>
                      {item.quantity} × ₹
                      {item.price.toLocaleString(
                        "en-IN"
                      )}
                    </span>
                  </div>

                  <strong>
                    ₹
                    {(
                      item.price *
                      item.quantity
                    ).toLocaleString(
                      "en-IN"
                    )}
                  </strong>
                </div>
              ))}
            </div>

            <div className="review-total">
              <span>Total</span>

              <strong>
                ₹
                {cartTotal.toLocaleString(
                  "en-IN"
                )}
              </strong>
            </div>

            <div className="agent-explanation">
              <strong>
                ✦ ShopPilot decision
              </strong>

              <p>
                Your cart stays within
                your ₹
                {maxPurchase.toLocaleString(
                  "en-IN"
                )}
                {" "}purchase limit.
              </p>

              {cart.some(
                (item) =>
                  item.category ===
                  "running accessories"
              ) && (
                <p>
                  Accessories were
                  recommended because they
                  complement your running
                  purchase and stay within
                  your ₹{maxUpsell} upsell
                  limit.
                </p>
              )}
            </div>

            {paymentStatus ===
              PAYMENT_STATES.PAID && (
              <div className="payment-success">
                <div className="success-icon">
                  ✓
                </div>

                <h3>
                  Payment successful
                </h3>

                <p>
                  Your ShopPilot order
                  has been confirmed.
                </p>

                <button
                  className="checkout-button"
                  onClick={() =>
                    setReviewOpen(false)
                  }
                >
                  Done
                </button>
              </div>
            )}

            {paymentStatus ===
              PAYMENT_STATES.FAILED && (
              <div className="payment-failure">
                <h3>
                  Payment failed
                </h3>

                <p>
                  Nothing was charged.
                  Your cart is still saved.
                </p>

                <button
                  className="checkout-button"
                  onClick={() =>
                    setPaymentStatus(
                      PAYMENT_STATES.IDLE
                    )
                  }
                >
                  Try again
                </button>
              </div>
            )}

            {paymentStatus !==
              PAYMENT_STATES.PAID &&
              paymentStatus !==
                PAYMENT_STATES.FAILED && (
              <button
                className="pay-button"
                onClick={handleCheckout}
                disabled={loading}
              >
                {paymentStatus ===
                  PAYMENT_STATES.CREATING_ORDER
                  ? "Creating order..."
                  : paymentStatus ===
                    PAYMENT_STATES.CHECKOUT_OPEN
                  ? "Opening Razorpay..."
                  : "Confirm & Pay ₹" +
                    cartTotal.toLocaleString(
                      "en-IN"
                    )}
              </button>
            )}

            <p className="test-mode-note">
              Razorpay Test Mode · No real
              money will be charged
            </p>
          </div>
        </div>
      )}

      {/* MERCHANT DASHBOARD MODAL */}

      <div className="dashboard-insight">
  <span className="eyebrow">
    SHOPPILOT INSIGHT
  </span>

  <h3>
    AI-assisted orders are growing basket value
  </h3>

  <p>
    ShopPilot uses contextual recommendations to
    increase order value without exceeding merchant
    controls.
  </p>
</div>
      {dashboardOpen && (
        <div
          className="overlay"
          onClick={() =>
            setDashboardOpen(false)
          }
        >
          <div
            style={{
              width: "95vw",
              height: "92vh",
              overflow: "auto",
              background: "#fafafa",
              borderRadius: "18px",
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <MerchantDashboard />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
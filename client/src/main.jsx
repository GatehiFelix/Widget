import ReactDOM from "react-dom/client";
import React from "react";
import App from "./App.jsx";
import "./index.css";

const params    = new URLSearchParams(window.location.search);
const widgetKey = params.get("key");        // ← "key" matches buildLoaderScript
const clientId  = params.get("clientId");
const productId = params.get("productId");
  
if (widgetKey)  localStorage.setItem("widget_key",        widgetKey);
if (clientId)   localStorage.setItem("widget_client_id",  clientId);
if (productId)  localStorage.setItem("widget_product_id", productId);

console.log("Widget loader initialized with:", {
  widgetKey: localStorage.getItem("widget_key"),
  clientId: localStorage.getItem("widget_client_id"),
  productId: localStorage.getItem("widget_product_id"),
});


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


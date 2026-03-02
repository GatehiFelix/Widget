import ReactDOM from "react-dom/client";
import React from "react";
import App from "./App.jsx";
import "./index.css";

const params  =new URLSearchParams(window.location.search);
const clientId = params.get("clientId");
const productId = params.get("productId");
const widgetKey = params.get("widgetKey");
  
if (widgetKey)  localStorage.setItem("widget_key",        widgetKey);
if (clientId)   localStorage.setItem("widget_client_id",  clientId);
if (productId)  localStorage.setItem("widget_product_id", productId);


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
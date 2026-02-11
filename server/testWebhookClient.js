// testWebhookClient.js
import { io } from "socket.io-client";

const socket = io("http://localhost:5000"); // Use the port of your receiving backend

socket.on("connect", () => {
  console.log("Connected to Socket.IO server:", socket.id);
});

socket.on("conversation-webhook", (data) => {
  console.log("Received conversation-webhook event:", data);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});
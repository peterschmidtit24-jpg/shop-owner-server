/**
 * Application entry point for the Shop Owner REST API.
 *
 * This module creates the Express application, installs shared middleware,
 * mounts the feature routers, and starts the HTTP server on port 8080.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import ordersRouter from "./routes/orders.js";
import productsRouter from "./routes/products.js";
import customersRouter from "./routes/customers.js";
import authRouter from "./routes/auth.js";
import { requireConfirmedOwner } from "./auth/middleware.js";

const app = express();
const port = 8080;

// Log requests during development, allow the configured client origin, and
// deserialize JSON request bodies before they reach the route handlers.
app.use(morgan("dev"));
app.use(cors({
  origin: process.env.ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Make product images stored in src/images available through /images/<file>.
app.use("/images", express.static("src/images"));

// Group the API endpoints by the resource that they manage.
app.use("/api/auth", authRouter);
app.use("/api/products", requireConfirmedOwner, productsRouter);
app.use("/api/orders", requireConfirmedOwner, ordersRouter);
app.use("/api/customers", requireConfirmedOwner, customersRouter);

/**
 * Lightweight health/welcome endpoint.
 * Useful for confirming that the deployed API is reachable without querying
 * the database.
 */
app.get("/", (_req, res) => {
  res.send("Shop Owner API");
});

// Start accepting HTTP requests after all middleware and routes are registered.
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

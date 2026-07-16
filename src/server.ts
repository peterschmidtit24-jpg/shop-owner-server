import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import ordersRouter from "./routes/orders.js";
import productsRouter from "./routes/products.js";
import customersRouter from "./routes/customers.js";

const app = express();
const port = 8080;

app.use(morgan("dev"));
app.use(cors({ origin: process.env.ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());
app.use("/images", express.static("src/images"));

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/customers", customersRouter);

app.get("/", (_req, res) => {
  res.send("Shop Owner API");
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

/**
 * Product API routes.
 *
 * Provides CRUD operations for the shop catalogue and validates incoming
 * values before they are written to PostgreSQL through Prisma.
 */
import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";

const productsRouter = Router();

/**
 * Returns every product, newest first.
 *
 * @param _req - Express request; this endpoint does not use request data.
 * @param res - Express response used to return the product list or an error.
 */
async function getProducts(_req: Request, res: Response) {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.json(products);
  } catch (error) {
    console.error("Failed to get products:", error);
    return res.status(500).json({ message: "Failed to get products" });
  }
}

/**
 * Returns one product selected by its route parameter.
 *
 * @param req - Request containing `params.productId`.
 * @param res - Response used for the product, validation error, or not-found result.
 */
async function getProductById(req: Request, res: Response) {
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    return res.status(400).json({
      message: "Invalid product ID",
    });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.json(product);

  } catch (error) {

    console.error("Failed to get product:", error);
    return res.status(500).json({ message: "Failed to get product" });
  }
}

/**
 * Creates a catalogue product after validating all required and optional fields.
 *
 * @param req - Request body with `name`, `price`, `stock`, and optional
 * `description` and `imageUrl` values.
 * @param res - Response used to return the created product with HTTP 201.
 */
async function createProduct(req: Request, res: Response) {
  const { name, description, price, stock, imageUrl } = req.body;

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ message: "name is required" });
  }

  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({
      message: "price must be a non-negative number",
    });
  }

  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({
      message: "stock must be a non-negative integer",
    });
  }

  if (description != null && typeof description !== "string") {
    return res.status(400).json({
      message: "description must be a string or null",
    });
  }

  if (imageUrl != null && typeof imageUrl !== "string") {
    return res.status(400).json({
      message: "imageUrl must be a string or null",
    });
  }

  try {
    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        price,
        stock,
        imageUrl: imageUrl ?? null,
      },
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error("Failed to create product:", error);
    return res.status(500).json({ message: "Failed to create product" });
  }
}

/**
 * Partially updates an existing product.
 *
 * @param req - Request containing `params.productId` and one or more editable
 * product fields in the JSON body.
 * @param res - Response used to return the updated product or a specific error.
 */
async function updateProduct(req: Request, res: Response) {
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ message: "A JSON body is required" });
  }

  const { name, description, price, stock, imageUrl } = req.body;
  const data: {
    name?: string;
    description?: string | null;
    price?: number;
    stock?: number;
    imageUrl?: string | null;
  } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ message: "name must not be empty" });
    }
    data.name = name.trim();
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== "string") {
      return res.status(400).json({
        message: "description must be a string or null",
      });
    }
    data.description = description;
  }

  if (price !== undefined) {
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: "price must be a non-negative number",
      });
    }
    data.price = price;
  }

  if (stock !== undefined) {
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({
        message: "stock must be a non-negative integer",
      });
    }
    data.stock = stock;
  }

  if (imageUrl !== undefined) {
    if (imageUrl !== null && typeof imageUrl !== "string") {
      return res.status(400).json({
        message: "imageUrl must be a string or null",
      });
    }
    data.imageUrl = imageUrl;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({
      message: "Provide at least one product field to update",
    });
  }

  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data,
    });

    return res.json(product);
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2025")) {
      return res.status(404).json({ message: "Product not found" });
    }

    console.error("Failed to update product:", error);
    return res.status(500).json({ message: "Failed to update product" });
  }
}

/**
 * Deletes a product when it is not referenced by an order.
 *
 * @param req - Request containing `params.productId`.
 * @param res - Response used to return the deleted product, 404, or a 409
 * conflict when relational data prevents deletion.
 */
async function deleteProduct(req: Request, res: Response) {
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const product = await prisma.product.delete({
      where: { id: productId },
    });

    return res.json({
      message: "Product deleted",
      product,
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2025")) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (hasPrismaErrorCode(error, "P2003")) {
      return res.status(409).json({
        message: "Product cannot be deleted because it has related orders",
      });
    }

    console.error("Failed to delete product:", error);
    return res.status(500).json({ message: "Failed to delete product" });
  }
}

/**
 * Narrows an unknown Prisma error to an object with a requested error code.
 * This keeps route error handling independent of generated Prisma error classes.
 *
 * @param error - Unknown value caught from a Prisma operation.
 * @param code - Prisma code to compare, for example `P2025` or `P2003`.
 */
function hasPrismaErrorCode(
  error: unknown,
  code: string,
): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

// Route order maps HTTP operations to their catalogue handlers.
productsRouter.get("/", getProducts);
productsRouter.get("/:productId", getProductById);
productsRouter.post("/", createProduct);
productsRouter.patch("/:productId", updateProduct);
productsRouter.delete("/:productId", deleteProduct);

export default productsRouter;

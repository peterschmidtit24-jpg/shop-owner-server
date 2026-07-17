/**
 * Order API routes.
 *
 * Coordinates orders with products and customers. Stock-changing operations
 * use database transactions so inventory and order data remain consistent.
 */
import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import {
  OrderStatus,
  type OrderStatus as OrderStatusType,
} from "../generated/prisma/enums.js";

const ordersRouter = Router();
// Derive accepted status strings from Prisma's generated enum.
const orderStatuses = Object.values(OrderStatus) as string[];
// Validate public IDs before passing them to UUID-backed database columns.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns all orders, including their related product and customer, newest first.
 *
 * @param _req - Express request; no request data is required.
 * @param res - Response used to return the orders or a server error.
 */
async function getOrders(_req: Request, res: Response) {
  try {
    const orders = await prisma.order.findMany({
      include: {
        product: true,
        customer: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(orders);
  } catch (error) {
    console.error("Failed to get orders:", error);
    return res.status(500).json({ message: "Failed to get orders" });
  }
}

/**
 * Returns one fully populated order by UUID.
 *
 * @param req - Request containing `params.orderId`.
 * @param res - Response used for the order or an appropriate 400/404/500 error.
 */
async function getOrderById(req: Request, res: Response) {
  const orderId = req.params.orderId;

  if (typeof orderId !== "string" || !uuidPattern.test(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: true,
        customer: true,
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("Failed to get order:", error);
    return res.status(500).json({ message: "Failed to get order" });
  }
}

/**
 * Creates an order and reduces product stock atomically.
 *
 * An existing customer can be selected with `customerId`. Otherwise the
 * function reuses a customer by email or creates a new customer. The order
 * total is calculated from the current product price.
 *
 * @param req - Body containing `productId`, positive `quantity`, and either a
 * `customerId` or customer name with an optional email.
 * @param res - Response used to return the created order with HTTP 201.
 */
async function simulateOrder(req: Request, res: Response) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ message: "A JSON body is required" });
  }

  const { productId, customerId, customerName, customerEmail, quantity } =
    req.body;

  if (typeof productId !== "string" || !uuidPattern.test(productId)) {
    return res.status(400).json({ message: "A valid productId is required" });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: "quantity must be a positive integer",
    });
  }

  if (
    customerId !== undefined &&
    (typeof customerId !== "string" || !uuidPattern.test(customerId))
  ) {
    return res.status(400).json({ message: "customerId must be a valid UUID" });
  }

  if (
    customerId === undefined &&
    (typeof customerName !== "string" || customerName.trim() === "")
  ) {
    return res.status(400).json({
      message: "customerName is required when customerId is not provided",
    });
  }

  if (
    customerEmail !== undefined &&
    customerEmail !== null &&
    (typeof customerEmail !== "string" || customerEmail.trim() === "")
  ) {
    return res.status(400).json({
      message: "customerEmail must be a non-empty string or null",
    });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new ApiError(404, "Product not found");
      }

      const stockUpdate = await tx.product.updateMany({
        where: {
          id: productId,
          stock: { gte: quantity },
        },
        data: {
          stock: { decrement: quantity },
        },
      });

      if (stockUpdate.count === 0) {
        throw new ApiError(409, "Not enough product stock");
      }

      let customer;

      if (typeof customerId === "string") {
        customer = await tx.customer.findUnique({
          where: { id: customerId },
        });

        if (!customer) {
          throw new ApiError(404, "Customer not found");
        }
      } else if (typeof customerEmail === "string") {
        customer = await tx.customer.upsert({
          where: { email: customerEmail.trim() },
          update: {},
          create: {
            name: customerName.trim(),
            email: customerEmail.trim(),
          },
        });
      } else {
        customer = await tx.customer.create({
          data: {
            name: customerName.trim(),
            email: null,
          },
        });
      }

      return tx.order.create({
        data: {
          productId: product.id,
          customerId: customer.id,
          quantity,
          total: Math.round(product.price * quantity * 100) / 100,
        },
        include: {
          product: true,
          customer: true,
        },
      });
    });

    return res.status(201).json(order);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Failed to simulate order:", error);
    return res.status(500).json({ message: "Failed to simulate order" });
  }
}

/**
 * Changes an order's workflow status and restores stock when it is cancelled.
 * Cancelled orders cannot be reopened, protecting inventory consistency.
 *
 * @param req - Request containing `params.orderId` and `body.status`.
 * @param res - Response used to return the updated order or a validation/conflict error.
 */
async function updateOrderStatus(req: Request, res: Response) {
  const orderId = req.params.orderId;
  const status = req.body?.status;

  if (typeof orderId !== "string" || !uuidPattern.test(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  if (typeof status !== "string" || !orderStatuses.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${orderStatuses.join(", ")}`,
    });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!existingOrder) {
        throw new ApiError(404, "Order not found");
      }

      if (
        existingOrder.status === OrderStatus.CANCELLED &&
        status !== OrderStatus.CANCELLED
      ) {
        throw new ApiError(409, "A cancelled order cannot be reopened");
      }

      if (
        status === OrderStatus.CANCELLED &&
        existingOrder.status !== OrderStatus.CANCELLED
      ) {
        await tx.product.update({
          where: { id: existingOrder.productId },
          data: { stock: { increment: existingOrder.quantity } },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: status as OrderStatusType },
        include: {
          product: true,
          customer: true,
        },
      });
    });

    return res.json(order);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Failed to update order status:", error);
    return res.status(500).json({ message: "Failed to update order status" });
  }
}

/**
 * Changes the quantity of a pending order and reconciles product stock.
 * Increasing quantity reserves more stock; decreasing it returns the difference.
 *
 * @param req - Request containing `params.orderId` and a positive `body.quantity`.
 * @param res - Response used to return the recalculated order or an error.
 */
async function updateOrder(req: Request, res: Response) {
  const orderId = req.params.orderId;
  const quantity = req.body?.quantity;

  if (typeof orderId !== "string" || !uuidPattern.test(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: "quantity must be a positive integer",
    });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { product: true },
      });

      if (!existingOrder) {
        throw new ApiError(404, "Order not found");
      }

      if (existingOrder.status !== OrderStatus.PENDING) {
        throw new ApiError(
          409,
          "Only pending orders can have their quantity changed",
        );
      }

      const quantityDifference = quantity - existingOrder.quantity;

      if (quantityDifference > 0) {
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: existingOrder.productId,
            stock: { gte: quantityDifference },
          },
          data: {
            stock: { decrement: quantityDifference },
          },
        });

        if (stockUpdate.count === 0) {
          throw new ApiError(409, "Not enough product stock");
        }
      } else if (quantityDifference < 0) {
        await tx.product.update({
          where: { id: existingOrder.productId },
          data: {
            stock: { increment: Math.abs(quantityDifference) },
          },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          quantity,
          total:
            Math.round(existingOrder.product.price * quantity * 100) / 100,
        },
        include: {
          product: true,
          customer: true,
        },
      });
    });

    return res.json(order);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Failed to update order:", error);
    return res.status(500).json({ message: "Failed to update order" });
  }
}

/**
 * Deletes a pending or cancelled order.
 * Pending-order stock is restored, while shipped and delivered orders are
 * retained as operational history.
 *
 * @param req - Request containing `params.orderId`.
 * @param res - Response used to return the deleted order or a conflict error.
 */
async function deleteOrder(req: Request, res: Response) {
  const orderId = req.params.orderId;

  if (typeof orderId !== "string" || !uuidPattern.test(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  try {
    const deletedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          product: true,
          customer: true,
        },
      });

      if (!order) {
        throw new ApiError(404, "Order not found");
      }

      if (
        order.status === OrderStatus.SHIPPED ||
        order.status === OrderStatus.DELIVERED
      ) {
        throw new ApiError(
          409,
          "Shipped or delivered orders cannot be deleted",
        );
      }

      if (order.status === OrderStatus.PENDING) {
        await tx.product.update({
          where: { id: order.productId },
          data: { stock: { increment: order.quantity } },
        });
      }

      await tx.order.delete({
        where: { id: orderId },
      });

      return order;
    });

    return res.json({
      message: "Order deleted",
      order: deletedOrder,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Failed to delete order:", error);
    return res.status(500).json({ message: "Failed to delete order" });
  }
}

/**
 * Expected business-rule error that carries an HTTP status code.
 * Throwing this inside a transaction rolls the transaction back while allowing
 * the route handler to return a precise client-facing response.
 */
class ApiError extends Error {
  /**
   * @param status - HTTP status that represents the failure.
   * @param message - Safe explanation returned to the API client.
   */
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// POST / and POST /simulate intentionally expose the same creation behavior.
ordersRouter.get("/", getOrders);
ordersRouter.post("/", simulateOrder);
ordersRouter.post("/simulate", simulateOrder);
ordersRouter.get("/:orderId", getOrderById);
ordersRouter.patch("/:orderId", updateOrder);
ordersRouter.patch("/:orderId/status", updateOrderStatus);
ordersRouter.delete("/:orderId", deleteOrder);

export default ordersRouter;

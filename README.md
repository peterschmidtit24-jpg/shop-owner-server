# Shop Owner Server

REST API for the Shop Owner dashboard, built with TypeScript, Express, Prisma ORM, and PostgreSQL.

## Technology

- Node.js
- TypeScript
- Express 5
- PostgreSQL
- Prisma ORM 7 with the PostgreSQL driver adapter
- Morgan for request logging
- `tsx` for the development server

## Prerequisites

Install the following before setting up the project:

- Node.js and npm
- PostgreSQL
- A PostgreSQL user with permission to create databases
- Postman or another HTTP client for testing

Check the installations in PowerShell:

```powershell
node --version
npm --version
```

If PostgreSQL is installed in the same location used during development, check it with:

```powershell
& "E:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

Adjust that path if PostgreSQL is installed elsewhere.

## 1. Create and initialize the server project

From the directory that should contain the server:

```powershell
mkdir shop-owner-server
cd shop-owner-server
npm init -y
```

Install runtime dependencies:

```powershell
npm install express morgan cors dotenv pg @prisma/client @prisma/adapter-pg
```

Install development dependencies:

```powershell
npm install --save-dev typescript tsx prisma @types/node @types/express @types/morgan @types/cors
```

## 2. Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Set ESM mode and scripts in `package.json`:

```json
{
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit"
  }
}
```

The scripts have these purposes:

- `npm run dev` starts the TypeScript server and restarts it after source changes.
- `npm run typecheck` checks types without generating output.
- `npm run build` compiles `src` into `dist`.
- `npm start` runs the compiled JavaScript server.

Because the project uses `NodeNext`, relative imports include `.js`, even inside TypeScript source files:

```ts
import productsRouter from "./routes/products.js";
```

TypeScript translates this to the correct compiled JavaScript import.

## 3. Create the project directories

The relevant project structure is:

```text
shop-owner-server/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── db/
│   │   └── prisma.ts
│   ├── generated/
│   │   └── prisma/
│   ├── images/
│   │   └── Texttiles.png
│   ├── routes/
│   │   ├── orders.ts
│   │   └── products.ts
│   └── server.ts
├── .env
├── .gitignore
├── package.json
├── prisma.config.ts
└── tsconfig.json
```

Create the source directories if they do not exist:

```powershell
New-Item -ItemType Directory -Force src, src\db, src\routes, src\images
```

## 4. Create the PostgreSQL database

The database is named `shop-owner`.

With the PostgreSQL installation used for this project:

```powershell
& "E:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres -h localhost -p 5432 "shop-owner"
```

PowerShell requires the `&` call operator because the executable path contains spaces. PostgreSQL may prompt for the password. Nothing is displayed while the password is typed.

Verify the database:

```powershell
& "E:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -l
```

The list should contain `shop-owner`.

The SQL equivalent is:

```sql
CREATE DATABASE "shop-owner";
```

The quotes are required in SQL because the database name contains a hyphen.

## 5. Configure the environment

Create `.env` in the server root:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/shop-owner"
```

Replace `YOUR_PASSWORD` with the actual PostgreSQL password. If the password contains URL-special characters, URL-encode them.

Never commit `.env`. Add this `.gitignore`:

```gitignore
node_modules/
dist/
*.log
.env
.env.*
!.env.example
```

## 6. Initialize Prisma

For a new project, initialize Prisma for PostgreSQL:

```powershell
npx prisma init --datasource-provider postgresql
```

Prisma 7 reads the connection URL through `prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

## 7. Define the data model

Use the following `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Product {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?
  price       Float
  stock       Int
  imageUrl    String?
  createdAt   DateTime @default(now())
  orders      Order[]
}

model Customer {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  email     String?  @unique
  createdAt DateTime @default(now())
  orders    Order[]
}

model Order {
  id         String      @id @default(uuid()) @db.Uuid
  product    Product     @relation(fields: [productId], references: [id])
  productId  String      @db.Uuid
  customer   Customer    @relation(fields: [customerId], references: [id])
  customerId String      @db.Uuid
  quantity   Int
  status     OrderStatus @default(PENDING)
  total      Float
  createdAt  DateTime    @default(now())
}

enum OrderStatus {
  PENDING
  SHIPPED
  DELIVERED
  CANCELLED
}
```

`String?` means a nullable string. For example, `description` may contain text or `null`.

IDs are UUID strings rather than incrementing integers. An example ID is:

```text
497cecd9-d6d7-4b30-86c6-7de9204baf67
```

For a production financial system, consider replacing `Float` money fields with `Decimal`, because floating-point arithmetic can introduce rounding errors.

## 8. Create the tables and Prisma Client

Create and apply the initial migration:

```powershell
npx prisma migrate dev --name init
```

Generate the client after schema changes:

```powershell
npx prisma generate
```

Useful Prisma commands:

```powershell
npx prisma validate
npx prisma migrate status
npx prisma studio
```

Prisma Studio opens a browser interface for inspecting and editing database records.

## 9. Create the Prisma database client

Create `src/db/prisma.ts`:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
```

This creates one reusable Prisma Client for the route modules.

## 10. Add the first dummy routes

Dummy handlers are useful for verifying Express routing before adding database operations.

Create `src/routes/products.ts`:

```ts
import { Router, type Request, type Response } from "express";

const productsRouter = Router();

function getProducts(_req: Request, res: Response) {
  res.json({ message: "Get all products", products: [] });
}

function getProductById(req: Request, res: Response) {
  res.json({
    message: "Get one product",
    productId: req.params.productId,
  });
}

function createProduct(req: Request, res: Response) {
  res.status(201).json({
    message: "Create product",
    product: req.body,
  });
}

function updateProduct(req: Request, res: Response) {
  res.json({
    message: "Update product",
    productId: req.params.productId,
    changes: req.body,
  });
}

function deleteProduct(req: Request, res: Response) {
  res.json({
    message: "Delete product",
    productId: req.params.productId,
  });
}

productsRouter.get("/", getProducts);
productsRouter.get("/:productId", getProductById);
productsRouter.post("/", createProduct);
productsRouter.patch("/:productId", updateProduct);
productsRouter.delete("/:productId", deleteProduct);

export default productsRouter;
```

Create `src/routes/orders.ts`:

```ts
import { Router, type Request, type Response } from "express";

const ordersRouter = Router();

function getOrders(_req: Request, res: Response) {
  res.json({ message: "Get all orders", orders: [] });
}

function getOrderById(req: Request, res: Response) {
  res.json({
    message: "Get one order",
    orderId: req.params.orderId,
  });
}

function simulateOrder(req: Request, res: Response) {
  res.status(201).json({
    message: "Simulate order",
    order: req.body,
  });
}

function updateOrderStatus(req: Request, res: Response) {
  res.json({
    message: "Update order status",
    orderId: req.params.orderId,
    status: req.body.status,
  });
}

ordersRouter.get("/", getOrders);
ordersRouter.post("/simulate", simulateOrder);
ordersRouter.get("/:orderId", getOrderById);
ordersRouter.patch("/:orderId/status", updateOrderStatus);

export default ordersRouter;
```

Register `/simulate` before `/:orderId`; otherwise Express could interpret `simulate` as an order ID.

## 11. Create the Express server

Create `src/server.ts`:

```ts
import express from "express";
import morgan from "morgan";
import ordersRouter from "./routes/orders.js";
import productsRouter from "./routes/products.js";

const app = express();
const port = 8080;

app.use(morgan("dev"));
app.use(express.json());

app.use("/images", express.static("src/images"));
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);

app.get("/", (_req, res) => {
  res.send("Shop Owner API");
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
```

`express.json()` parses JSON request bodies. The static middleware makes `src/images/Texttiles.png` available at:

```text
http://localhost:8080/images/Texttiles.png
```

File capitalization matters on case-sensitive systems.

## 12. Replace product dummy handlers with Prisma

Import the Prisma Client in `src/routes/products.ts`:

```ts
import { prisma } from "../db/prisma.js";
```

The real GET handler is:

```ts
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
```

The real POST handler validates the request and calls `prisma.product.create()`:

```ts
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
```

The remaining handlers can be connected to Prisma incrementally using the same validation, error-handling, and relation-loading approach.

## 13. Run the server

Development mode:

```powershell
npm run dev
```

Keep this terminal running while using Postman. A successful startup prints:

```text
Server running on http://localhost:8080
```

Production-style build and start:

```powershell
npm run typecheck
npm run build
npm start
```

## 14. Test with Postman

### Check the server

```http
GET http://localhost:8080/
```

Expected response:

```text
Shop Owner API
```

### Create a product

```http
POST http://localhost:8080/api/products
Content-Type: application/json
```

Body:

```json
{
  "name": "Linen Tote Bag",
  "description": "Reusable natural linen shopping bag.",
  "price": 34.99,
  "stock": 3,
  "imageUrl": "http://localhost:8080/images/Texttiles.png"
}
```

The successful response status is `201 Created`. Prisma generates the UUID and creation date:

```json
{
  "id": "7346a82f-4fc8-47c6-9964-5ab19239d6be",
  "name": "Linen Tote Bag",
  "description": "Reusable natural linen shopping bag.",
  "price": 34.99,
  "stock": 3,
  "imageUrl": "http://localhost:8080/images/Texttiles.png",
  "createdAt": "2026-07-13T10:58:25.664Z"
}
```

### Get all products

```http
GET http://localhost:8080/api/products
```

The response is an array ordered by newest product first.

### Other routes

```text
GET    /api/products/:productId
PATCH  /api/products/:productId
DELETE /api/products/:productId

GET    /api/orders
GET    /api/orders/:orderId
POST   /api/orders/simulate
PATCH  /api/orders/:orderId
PATCH  /api/orders/:orderId/status
DELETE /api/orders/:orderId
```

## Troubleshooting

### `ECONNREFUSED 127.0.0.1:8080`

The Express server is not running. Start it and keep its terminal open:

```powershell
npm run dev
```

PostgreSQL and Express are separate processes. A running database does not automatically start the API.

Check whether port 8080 has a listener:

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen
```

### Prisma cannot connect to PostgreSQL

Confirm that PostgreSQL is running:

```powershell
Get-Service -Name "*postgres*"
```

Then check that `.env` contains the correct username, password, host, port, and `shop-owner` database name.

### Database exists but tables do not

Apply the migrations:

```powershell
npx prisma migrate dev
```

### Prisma types do not match the schema

Regenerate the client and type-check:

```powershell
npx prisma generate
npm run typecheck
```

### The image returns 404

Verify all of the following:

- The file exists at `src/images/Texttiles.png`.
- The server is running.
- The URL uses the capital `T`: `http://localhost:8080/images/Texttiles.png`.

## Current API status

Implemented with PostgreSQL:

```text
GET    /api/products
GET    /api/products/:productId
POST   /api/products
PATCH  /api/products/:productId
DELETE /api/products/:productId
GET    /api/orders
GET    /api/orders/:orderId
POST   /api/orders/simulate
PATCH  /api/orders/:orderId
PATCH  /api/orders/:orderId/status
DELETE /api/orders/:orderId
```

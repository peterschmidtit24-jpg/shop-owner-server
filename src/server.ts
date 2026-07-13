import express from "express";
import morgan from "morgan";

const app = express();
const port = 8080;

app.use(morgan("dev"));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

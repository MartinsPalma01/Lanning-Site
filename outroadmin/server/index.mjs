import app from "./app.mjs";

const port = Number(process.env.PORT || 8080);

app.listen(port, () => {
  console.log(`Lanning Amaral site listening on http://localhost:${port}`);
});

// backend/middleware/errorMiddleware.js

export const errorHandler = (err, _req, res, _next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Handle Multer errors (file upload)
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ error: "File too large. Maximum size is 5 MB." });
  }
  if (err.message === "Only image files are allowed") {
    return res.status(400).json({ error: err.message });
  }

  console.error("❌ [ErrorHandler]", err.message);

  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

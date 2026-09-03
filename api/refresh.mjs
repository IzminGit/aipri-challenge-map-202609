import { refreshData } from "../tools/refresh-data.mjs";

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const data = await refreshData({ log: false, writeFiles: false });
    response.status(200).json(data);
  } catch (error) {
    response.status(500).json({
      error: "refresh_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

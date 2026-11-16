import type { NextApiRequest, NextApiResponse } from "next";
import { Upload } from "@aws-sdk/lib-storage";

import { createNextApiContext } from "@kan/api/trpc-context";
import { withApiLogging } from "@kan/api/utils/apiLogging";
import { assertPermission } from "@kan/api/utils/permissions";
import { withRateLimit } from "@kan/api/utils/rateLimit";
import * as boardRepo from "@kan/db/repository/board.repo";
import { createLogger } from "@kan/logger";
import { createS3Client, deleteObject, generateUID } from "@kan/shared/utils";

import { env } from "~/env";

const log = createLogger("api");

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
// SVG is intentionally excluded: it can carry scripts when opened directly.
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withRateLimit(
  { points: 30, duration: 60 },
  withApiLogging(async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { user, db } = await createNextApiContext(req);

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bucket = env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME;
      if (!bucket) {
        return res
          .status(500)
          .json({ error: "Attachments bucket not configured" });
      }

      const boardPublicId = req.query.boardPublicId;
      if (typeof boardPublicId !== "string" || boardPublicId.length < 12) {
        return res.status(400).json({ error: "Invalid boardPublicId" });
      }

      const contentType = req.headers["content-type"];
      const contentLengthHeader = req.headers["content-length"];
      const contentLength = contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : NaN;

      if (
        typeof contentType !== "string" ||
        !ALLOWED_CONTENT_TYPES.includes(contentType)
      ) {
        return res.status(400).json({ error: "Invalid content type" });
      }

      if (!Number.isFinite(contentLength) || contentLength <= 0) {
        return res
          .status(400)
          .json({ error: "Missing or invalid content length" });
      }

      if (contentLength > MAX_SIZE_BYTES) {
        return res.status(400).json({ error: "File too large" });
      }

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        db,
        boardPublicId,
      );

      if (!board) {
        return res.status(404).json({ error: "Board not found" });
      }

      try {
        await assertPermission(db, user.id, board.workspaceId, "board:edit");
      } catch {
        return res.status(403).json({ error: "Permission denied" });
      }

      const extension = contentType.split("/")[1] ?? "img";
      const s3Key = `${board.workspaceId}/boards/${boardPublicId}/${generateUID()}.${extension}`;

      const upload = new Upload({
        client: createS3Client(),
        params: {
          Bucket: bucket,
          Key: s3Key,
          Body: req,
          ContentType: contentType,
          ContentLength: contentLength,
        },
        leavePartsOnError: false,
      });

      await upload.done();

      const previousKey = board.backgroundImageKey;

      await boardRepo.updateBackgroundImageKey(db, board.id, s3Key);

      if (previousKey) {
        try {
          await deleteObject(bucket, previousKey);
        } catch (err) {
          log.warn({ err }, "Failed to delete old board background image");
        }
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      log.error({ err: error }, "Board background upload failed");
      return res.status(500).json({ error: "Internal server error" });
    }
  }),
);

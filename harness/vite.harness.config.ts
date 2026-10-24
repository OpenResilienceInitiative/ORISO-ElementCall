/*
Copyright 2026 Open Resilience Initiative

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * A minimal Vite server for the visual-proof harness.
 *
 * Deliberately not the app's own config: that one pulls in the SVG loader, the
 * Sentry plugin, the config fetch and the whole widget bootstrap, none of
 * which the harness needs and all of which can fail for reasons that have
 * nothing to do with how the stage looks.
 *
 * `/static/anon-animals` is served from a real ORISO checkout, so the animals
 * in the screenshots are the ones the chat draws rather than stand-ins. The
 * path comes from the environment and the server simply has no artwork if it
 * is not given one — the faces then show initials, which is the truthful
 * result and not a crash.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const artwork = process.env.ORISO_ARTWORK_DIR;

export default defineConfig({
  root: ".",
  plugins: [
    react(),
    {
      name: "oriso-artwork",
      configureServer(server) {
        if (!artwork) return;
        server.middlewares.use("/static/anon-animals", (req, res, next) => {
          void (async () => {
            const { readFile } = await import("node:fs/promises");
            const { join, basename } = await import("node:path");
            const name = basename((req.url ?? "").split("?")[0]);
            try {
              const body = await readFile(join(artwork, name));
              res.setHeader("content-type", "image/svg+xml");
              res.end(body);
            } catch {
              next();
            }
          })();
        });
      },
    },
  ],
  server: { port: 6007, strictPort: true, host: "127.0.0.1" },
});

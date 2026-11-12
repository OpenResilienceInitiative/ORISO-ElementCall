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
import { realpathSync } from "node:fs";

import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import svgrPlugin from "vite-plugin-svgr";

const artwork = process.env.ORISO_ARTWORK_DIR;

export default defineConfig({
  root: ".",
  plugins: [
    {
      // A stand-in Träger logo on the tenant logo route, so `orisoLogo` can
      // point at the page's own (trusted) origin as in the real call.
      name: "oriso-sample-logo",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (
            !/^\/service\/tenant\/public\/branding\/\d+\/logo/.test(
              req.url ?? "",
            )
          ) {
            next();
            return;
          }
          res.setHeader("Content-Type", "image/svg+xml");
          res.end(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32" viewBox="0 0 120 32"><rect width="32" height="32" rx="6" fill="#0a7a3c"/><text x="40" y="22" font-family="sans-serif" font-size="15" font-weight="700" fill="#0a7a3c">Träger</text></svg>',
          );
        });
      },
    },
    react(),
    // As the app: icons are imported as components (the settings dialog's
    // checkbox and close icons need it).
    svgrPlugin({ svgrOptions: { ref: true } }),
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
  server: {
    port: 6007,
    strictPort: true,
    host: "127.0.0.1",
    // A worktree may link node_modules from another checkout; without its
    // real path Vite refuses the Inter font files and the proof shows a
    // fallback font.
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        realpathSync("node_modules"),
      ],
    },
  },
});

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#f8f7f3] p-6 text-[#181816] antialiased">
        <div className="w-full max-w-md space-y-4 rounded-md border border-[#dcd8cc] bg-white p-6">
          <h1 className="text-lg font-semibold">Critical Application Error</h1>
          <p className="text-sm text-[#5c5a53]">
            Greater Cairo Atlas encountered an unrecoverable layout error.
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-[#5c5a53]">
              Digest: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-[#1c2833] px-4 py-2 text-sm font-medium text-[#f8f7f3]"
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}

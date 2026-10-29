import { lazy, Suspense, type ComponentProps } from "react";
import type { Chart as ChartComponent } from "./charts";
const LazyChart = lazy(() =>
  import("./charts").then((module) => ({ default: module.Chart })),
);
export function Chart(props: ComponentProps<typeof ChartComponent>) {
  return (
    <Suspense
      fallback={
        <div
          className="chart grid place-items-center text-muted text-xs"
          role="status"
        >
          Preparing chart…
        </div>
      }
    >
      <LazyChart {...props} />
    </Suspense>
  );
}

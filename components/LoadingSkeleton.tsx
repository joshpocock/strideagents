"use client";

interface LoadingSkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export default function LoadingSkeleton({
  width = "100%",
  height = 20,
  borderRadius = 6,
}: LoadingSkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
}

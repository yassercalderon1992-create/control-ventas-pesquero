
export interface LoaderProps {
    label?: string;
    fullScreen?: boolean;
  }
  
  export default function Loader({
    label = "Cargando...",
    fullScreen = false,
  }: LoaderProps) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          minHeight: fullScreen ? "100vh" : undefined,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            border: "3px solid #dbeafe",
            borderTopColor: "#1764c0",
            borderRadius: "50%",
            animation: "erp-loader-spin 0.8s linear infinite",
          }}
        />
        <span>{label}</span>
  
        <style>
          {`
            @keyframes erp-loader-spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }
  
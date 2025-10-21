import React from "react";

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#0a0a0a",
  padding: "24px",
};

const contentStyle: React.CSSProperties = {
  height: "100%",
  minHeight: "60vh",
  borderRadius: "16px",
  border: "1px dashed rgba(255, 255, 255, 0.08)",
  backgroundColor: "rgba(255, 255, 255, 0.02)",
};

const NewSimpleGridUI: React.FC = () => {
  return (
    <div style={containerStyle}>
      <div style={contentStyle} />
    </div>
  );
};

export default NewSimpleGridUI;

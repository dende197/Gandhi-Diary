module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "surface-variant": "#2d3449",
        "on-primary-container": "#d5dcff",
        "surface-bright": "#31394d",
        "surface-container-lowest": "#060e20",
        "surface": "#0b1326",
        "primary": "#3b82f6",
        "inverse-primary": "#2b55ca",
        "tertiary-fixed": "#d4e3ff",
        "on-tertiary-container": "#cadeff",
        "error": "#ffb4ab",
        "on-secondary-container": "#aeb9d0",
        "on-error": "#690005",
        "on-primary": "#00184a",
        "primary-fixed-dim": "#b6c4ff",
        "on-surface-variant": "#c4c5d6",
        "outline": "#8e909f",
        "error-container": "#3a0a0a",
        "on-primary-fixed-variant": "#003baf",
        "on-secondary-fixed-variant": "#3c475a",
        "on-secondary": "#263143",
        "inverse-surface": "#dae2fd",
        "surface-container-low": "#131b2e",
        "background": "#0b1326",
        "tertiary-container": "#0062b0",
        "inverse-on-surface": "#283044",
        "surface-container-high": "#222a3d",
        "secondary": "#bcc7de",
        "on-surface": "#dae2fd",
        "on-secondary-fixed": "#111c2d",
        "primary-container": "#2f58cd",
        "on-background": "#dae2fd",
        "surface-tint": "#b6c4ff",
        "on-error-container": "#ffdad6",
        "on-tertiary": "#00315d",
        "secondary-fixed": "#d8e3fb",
        "tertiary": "#a4c9ff",
        "primary-fixed": "#dce1ff",
        "secondary-container": "#3e495d",
        "on-primary-fixed": "#00164f",
        "surface-dim": "#0b1326",
        "surface-container": "#171f33",
        "secondary-fixed-dim": "#bcc7de",
        "surface-container-highest": "#2d3449",
        "tertiary-fixed-dim": "#a4c9ff",
        "on-tertiary-fixed-variant": "#004883",
        "outline-variant": "#434653",
        "on-tertiary-fixed": "#001c39",
        "green": "#34d399",
        "orange": "#fdba74"
      },
      "borderRadius": {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem"
      },
      "spacing": {
        "stack-md": "16px",
        "margin-mobile": "20px",
        "section-gap": "80px",
        "gutter": "24px",
        "stack-sm": "8px",
        "margin-desktop": "64px"
      },
      "fontFamily": {
        "headline-lg-mobile": [
          "Hanken Grotesk"
        ],
        "label-sm": [
          "Hanken Grotesk"
        ],
        "body-lg": [
          "Hanken Grotesk"
        ],
        "headline-lg": [
          "Hanken Grotesk"
        ],
        "title-md": [
          "Hanken Grotesk"
        ],
        "display-lg": [
          "Hanken Grotesk"
        ],
        "body-md": [
          "Hanken Grotesk"
        ]
      },
      "fontSize": {
        "headline-lg-mobile": [
          "28px",
          {
            "lineHeight": "1.2",
            "fontWeight": "600"
          }
        ],
        "label-sm": [
          "12px",
          {
            "lineHeight": "1.0",
            "letterSpacing": "0.05em",
            "fontWeight": "600"
          }
        ],
        "body-lg": [
          "17px",
          {
            "lineHeight": "1.6",
            "fontWeight": "400"
          }
        ],
        "headline-lg": [
          "34px",
          {
            "lineHeight": "1.2",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "title-md": [
          "20px",
          {
            "lineHeight": "1.3",
            "fontWeight": "600"
          }
        ],
        "display-lg": [
          "56px",
          {
            "lineHeight": "1.1",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "body-md": [
          "14px",
          {
            "lineHeight": "1.5",
            "fontWeight": "400"
          }
        ]
      }
    }
  }
};
module.exports.content = [require('path').join(__dirname,'../index.html'),require('path').join(__dirname,'../ui.js'),require('path').join(__dirname,'../app-bootstrap.js'),require('path').join(__dirname,'../fluidity-engine-v3.js')];
module.exports.plugins = [require('@tailwindcss/forms'),require('@tailwindcss/container-queries')];

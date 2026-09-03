// Allows `import './Foo.css'` for its side effect (style-loader injection).
declare module '*.css';

// Image imports return a base64 data URL string (asset/inline in webpack).
declare module '*.png' { const src: string; export default src; }
declare module '*.jpg' { const src: string; export default src; }
declare module '*.jpeg' { const src: string; export default src; }
declare module '*.gif' { const src: string; export default src; }
declare module '*.webp' { const src: string; export default src; }
declare module '*.svg' { const src: string; export default src; }
declare module '*.woff2' { const src: string; export default src; }

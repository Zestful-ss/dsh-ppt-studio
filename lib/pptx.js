// PPTX import/export entry points.
//
// importPptx turns a real OOXML package into the editable project template and
// a source binding map. exportImportedPptx rebuilds the package from the
// immutable source, patching only edited content.
export { importPptx } from './pptx-import.js';
export { exportImportedPptx } from './pptx-export.js';

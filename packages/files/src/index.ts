/** biome-ignore-all lint/performance/noBarrelFile: index is the only allowed file where we can export other files */

export {
  type CreateFilesContextResult,
  createFilesContext,
  type FileHandle,
  FileNotFoundError,
  type FileSpec,
  FileValidationError,
  osHomeConfigDir,
  osHomeDir,
} from './files.js';

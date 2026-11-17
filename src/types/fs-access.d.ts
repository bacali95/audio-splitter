/**
 * Minimal ambient types for the File System Access API (Chromium). lib.dom has
 * FileSystemHandle / FileSystemFileHandle but not the permission methods, the
 * open picker or DataTransferItem.getAsFileSystemHandle. Always feature-detect.
 */
export {}

declare global {
  type FileSystemPermissionState = 'granted' | 'denied' | 'prompt'

  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<FileSystemPermissionState>
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<FileSystemPermissionState>
  }

  interface OpenFilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface OpenFilePickerOptions {
    types?: OpenFilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    multiple?: boolean
  }

  interface Window {
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  }

  interface DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
  }
}

import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FileUploadProps {
  onFileUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
}

export function FileUpload({ onFileUpload, isProcessing }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const file = files[0];

    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx'))) {
      setSelectedFile(file);
      setUploadStatus('processing');
      try {
        await onFileUpload(file);
        setUploadStatus('success');
      } catch (error) {
        setUploadStatus('error');
      }
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus('processing');
      try {
        await onFileUpload(file);
        setUploadStatus('success');
      } catch (error) {
        setUploadStatus('error');
      }
    }
  }, [onFileUpload]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setUploadStatus('idle');
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (selectedFile && uploadStatus !== 'idle') {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <FileSpreadsheet className="w-10 h-10 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-base truncate" data-testid="text-filename">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-filesize">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {uploadStatus === 'processing' && (
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Processing...</span>
              </div>
            )}
            {uploadStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">Complete</span>
              </div>
            )}
            {uploadStatus === 'error' && (
              <span className="text-sm font-medium text-destructive">Upload failed</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleClear}
              data-testid="button-clear-file"
              disabled={isProcessing}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-md p-12 text-center transition-colors ${
        isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card'
      }`}
      data-testid="dropzone-upload"
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".csv,.xlsx"
        onChange={handleFileSelect}
        data-testid="input-file"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Upload Trading Data</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drag and drop your Robinhood CSV or Excel file here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground">
          Supported formats: CSV, XLSX
        </p>
      </label>
    </div>
  );
}

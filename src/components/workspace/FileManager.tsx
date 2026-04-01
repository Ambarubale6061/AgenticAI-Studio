import { useState } from "react";
import { FolderTree, Plus, Pencil, Trash2, FileCode, FileText, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PanelHeader from "./PanelHeader";
import type { CodeFile } from "./CodePanel";

interface FileManagerProps {
  files: CodeFile[];
  activeFileId?: string;
  onSelectFile: (id: string) => void;
  onCreateFile: (filename: string, language: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  onDeleteFile: (id: string) => void;
}

const langFromExt: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  html: "html",
  css: "css",
  json: "json",
  sh: "bash",
  txt: "text",
};

const langIcons: Record<string, string> = {
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  python: "text-green-400",
  html: "text-orange-400",
  css: "text-purple-400",
  json: "text-muted-foreground",
  bash: "text-muted-foreground",
  text: "text-muted-foreground",
};

function detectLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return langFromExt[ext] || "text";
}

const FileManager = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}: FileManagerProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFilename, setNewFilename] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = () => {
    const name = newFilename.trim();
    if (!name) return;
    const lang = detectLang(name);
    onCreateFile(name, lang);
    setNewFilename("");
    setIsCreating(false);
  };

  const handleRename = (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    onRenameFile(id, name);
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Files" icon={FolderTree} iconColor="text-primary">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            setIsCreating(true);
            setNewFilename("");
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </PanelHeader>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {isCreating && (
            <div className="flex items-center gap-1 px-2 py-1">
              <Input
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setIsCreating(false);
                }}
                placeholder="filename.js"
                className="h-6 text-xs bg-secondary border-panel-border"
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCreate}>
                <Check className="h-3 w-3 text-agent-coder" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setIsCreating(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {files.length === 0 && !isCreating && (
            <p className="text-[11px] text-muted-foreground/50 text-center py-6">
              No files yet
            </p>
          )}
          {files.map((file) => (
            <div key={file.id}>
              {renamingId === file.id ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(file.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-6 text-xs bg-secondary border-panel-border"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRename(file.id)}>
                    <Check className="h-3 w-3 text-agent-coder" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setRenamingId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => onSelectFile(file.id)}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group ${
                    file.id === activeFileId
                      ? "bg-primary/10 text-foreground border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className={`h-3.5 w-3.5 shrink-0 ${langIcons[file.language] || "text-muted-foreground"}`} />
                    <span className="truncate font-mono">{file.filename}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-secondary transition-all">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingId(file.id);
                          setRenameValue(file.filename);
                        }}
                      >
                        <Pencil className="h-3 w-3 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDeleteFile(file.id)}
                        disabled={files.length <= 1}
                      >
                        <Trash2 className="h-3 w-3 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FileManager;

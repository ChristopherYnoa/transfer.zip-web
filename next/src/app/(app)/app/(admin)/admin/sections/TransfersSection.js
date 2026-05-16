"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownToLineIcon,
  EyeIcon,
  Trash2Icon,
  CopyIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteTeamTransfer, getTransferDownloadLink } from "@/lib/client/Api";
import { humanFileSize } from "@/lib/transferUtils";
import { humanTimeUntil, tryCopyToClipboard } from "@/lib/utils";
import { ROLES } from "@/lib/roles";
import ProfilePic from "@/components/ProfilePic";
import AdminCard from "../AdminCard";

function Row({ transfer, canDelete, onDelete }) {
  const author = transfer.author;
  const expiresAt = transfer.expiresAt ? new Date(transfer.expiresAt) : null;
  const expired = expiresAt && expiresAt <= new Date();

  const handleCopy = async () => {
    if (await tryCopyToClipboard(getTransferDownloadLink(transfer))) {
      toast.success("Copied link");
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 transition">
      <div className="col-span-12 sm:col-span-5 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{transfer.name}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          {transfer.files.length} file{transfer.files.length === 1 ? "" : "s"} · {humanFileSize(transfer.size, true)}
        </div>
      </div>

      <div className="col-span-6 sm:col-span-3 flex items-center gap-2 min-w-0">
        {author ? (
          <>
            <ProfilePic name={author.fullName || author.email} size={28} />
            <div className="text-sm text-gray-700 truncate">
              {author.fullName || author.email.split("@")[0]}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500">Unknown</div>
        )}
      </div>

      <div className="col-span-3 sm:col-span-2 flex items-center gap-3 text-xs text-gray-600 tabular-nums">
        <span className="inline-flex items-center gap-1">
          <ArrowDownToLineIcon size={12} />
          {transfer.statistics.downloads.length}
        </span>
        <span className="inline-flex items-center gap-1">
          <EyeIcon size={12} />
          {transfer.statistics.views.length}
        </span>
      </div>

      <div className="col-span-2 sm:col-span-1 text-xs text-gray-600">
        {expired ? (
          <span className="text-amber-600">Expired</span>
        ) : expiresAt ? (
          `${humanTimeUntil(expiresAt)} left`
        ) : (
          "—"
        )}
      </div>

      <div className="col-span-1 flex justify-end gap-1">
        <button
          onClick={handleCopy}
          title="Copy link"
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition"
        >
          <CopyIcon size={14} />
        </button>
        {canDelete && (
          <button
            onClick={() => onDelete(transfer)}
            title="Delete transfer"
            className="p-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition"
          >
            <Trash2Icon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TransfersSection({ transfers, role }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const canDelete = role === ROLES.OWNER;

  const authors = useMemo(() => {
    const seen = new Map();
    transfers.forEach(t => {
      if (t.author && !seen.has(t.author.id)) {
        seen.set(t.author.id, t.author);
      }
    });
    return Array.from(seen.values());
  }, [transfers]);

  const filtered = useMemo(() => {
    return transfers.filter(t => {
      if (authorFilter !== "all" && t.author?.id !== authorFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${t.name} ${t.author?.email || ""} ${t.author?.fullName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transfers, query, authorFilter]);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await deleteTeamTransfer(target.id);
      toast.success("Transfer deleted");
      setTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <AdminCard>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search transfers or members"
            className="max-w-sm"
          />
          <Select value={authorFilter} onValueChange={setAuthorFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All members</SelectItem>
              {authors.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.fullName || a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-gray-500">
            {filtered.length} of {transfers.length}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {transfers.length === 0
              ? "No transfers have been created by team members yet."
              : "No transfers match your filters."}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b">
              <div className="col-span-5">Transfer</div>
              <div className="col-span-3">Uploaded by</div>
              <div className="col-span-2">Activity</div>
              <div className="col-span-1">Expires</div>
              <div className="col-span-1" />
            </div>
            {filtered.map(t => (
              <Row key={t.id} transfer={t} canDelete={canDelete} onDelete={setTarget} />
            ))}
          </div>
        )}
      </AdminCard>

      {!canDelete && transfers.length > 0 && (
        <p className="text-xs text-white px-1">
          Only the Owner can delete other members' transfers.
        </p>
      )}

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete transfer</DialogTitle>
            <DialogDescription>
              {target ? `"${target.name}" by ${target.author?.email || "unknown member"} will be permanently deleted.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 space-x-2">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={deleting}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

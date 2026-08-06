"use client";

import { HardwareAssistance } from "@/components/ava/HardwareAssistance";
import { MediaUploader } from "@/components/ava/MediaUploader";
import { DeviceIdentification } from "@/components/ava/DeviceIdentification";

type Candidate = {
  manufacturer: string;
  model: string;
  modelSlug: string;
  imageUrl: string | null;
  distinguishingFeatures: string[];
};

type Props = {
  showMedia: boolean;
  showUploader: boolean;
  showConfirmation: boolean;
  candidates: Candidate[];
  photoButtons?: ReadonlyArray<{ id: string; label: string }>;
  onConfirmDevice: (c: Candidate) => void;
  onRejectDevice: () => void;
  onUnsure: () => void;
  onSkipMedia: () => void;
  onOpenUploader: () => void;
  onMediaUploaded?: () => void;
  onPhotoAction?: (id: string) => void;
};

/** Panneau diagnostic matériel (photo + confirmation modèle). */
export function DiagnosticConversation({
  showMedia,
  showUploader,
  showConfirmation,
  candidates,
  photoButtons,
  onConfirmDevice,
  onRejectDevice,
  onUnsure,
  onSkipMedia,
  onOpenUploader,
  onMediaUploaded,
  onPhotoAction,
}: Props) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      {showMedia ? (
        <HardwareAssistance
          photoButtons={photoButtons}
          onTakePhoto={onOpenUploader}
          onAddPhoto={onOpenUploader}
          onRecordVideo={onOpenUploader}
          onAddVideo={onOpenUploader}
          onSkip={onSkipMedia}
          onPhotoAction={onPhotoAction}
        />
      ) : null}
      {showUploader ? <MediaUploader onUploaded={() => onMediaUploaded?.()} /> : null}
      {showConfirmation ? (
        <DeviceIdentification
          candidates={candidates}
          onConfirm={onConfirmDevice}
          onReject={onRejectDevice}
          onUnsure={onUnsure}
          onAddPhoto={onOpenUploader}
        />
      ) : null}
    </div>
  );
}

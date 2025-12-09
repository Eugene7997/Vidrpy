CREATE TABLE public.videos (
    video_id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,  -- ← ADD THIS
    filename character varying(255) NOT NULL,
    indexeddb_key character varying(255) NULL,
    cloud_path character varying(500) NULL,
    upload_status_private text NOT NULL DEFAULT 'pending',
    upload_status_cloud text NOT NULL DEFAULT 'pending',
    retry_count_private integer NOT NULL DEFAULT 0,
    retry_count_cloud integer NOT NULL DEFAULT 0,
    size_bytes bigint NULL,
    duration_ms bigint NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_modified timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT videos_pkey PRIMARY KEY (video_id),

    -- Foreign key to users table
    CONSTRAINT videos_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT videos_upload_status_cloud_check CHECK (
        upload_status_cloud = ANY (
            ARRAY['pending'::text, 'uploading'::text, 'success'::text, 'failed'::text]
        )
    ),

    CONSTRAINT videos_upload_status_private_check CHECK (
        upload_status_private = ANY (
            ARRAY['pending'::text, 'uploading'::text, 'success'::text, 'failed'::text]
        )
    )
) TABLESPACE pg_default;

-- Optional but HIGHLY recommended for query performance
CREATE INDEX IF NOT EXISTS videos_user_id_idx
    ON public.videos(user_id);

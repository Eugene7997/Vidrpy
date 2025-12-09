create table public.videos (
        video_id uuid not null default gen_random_uuid (),
        filename character varying(255) not null,
        indexeddb_key character varying(255) null,
        cloud_path character varying(500) null,
        upload_status_private text not null default 'pending'::text,
        upload_status_cloud text not null default 'pending'::text,
        retry_count_private integer not null default 0,
        retry_count_cloud integer not null default 0,
        size_bytes bigint null,
        duration_ms bigint null,
        created_at timestamp without time zone not null default CURRENT_TIMESTAMP,
        last_modified timestamp without time zone not null default CURRENT_TIMESTAMP,
        constraint videos_pkey primary key (video_id),
        constraint videos_upload_status_cloud_check check (
            (
             upload_status_cloud = any (
                 array[
                 'pending'::text,
                 'uploading'::text,
                 'success'::text,
                 'failed'::text
                 ]
                 )
            )
            ),
        constraint videos_upload_status_private_check check (
                (
                 upload_status_private = any (
                     array[
                     'pending'::text,
                     'uploading'::text,
                     'success'::text,
                     'failed'::text
                     ]
                     )
                )
                )
        ) TABLESPACE pg_default;

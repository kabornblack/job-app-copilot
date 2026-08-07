ALTER TABLE "generated_documents" ALTER COLUMN "file_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD COLUMN "content" text;
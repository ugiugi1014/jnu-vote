ALTER TABLE user_verifications
  ADD COLUMN doc_no VARCHAR(16) NULL AFTER student_id,
  ADD UNIQUE KEY uq_user_verifications_doc_no (doc_no);

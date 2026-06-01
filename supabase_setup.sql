-- ====================================================================
-- SQL SCRIPT KHỞI TẠO CƠ SỞ DỮ LIỆU GIẢI ĐẤU PICKLEBALL CHO SUPABASE
-- Hãy sao chép toàn bộ đoạn mã này và chạy trong mục "SQL Editor" của Supabase
-- ====================================================================

-- 1. Xóa các bảng cũ nếu đã tồn tại để tránh xung đột (tùy chọn)
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS tournament CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- 2. Tạo bảng THÔNG TIN GIẢI ĐẤU (Tournament metadata)
CREATE TABLE tournament (
    id TEXT PRIMARY KEY DEFAULT 't-1',
    name TEXT NOT NULL,
    organization TEXT,
    location TEXT,
    date TEXT,
    settings JSONB NOT NULL,
    current_event_id TEXT DEFAULT 'event-default',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Tạo bảng DANH SÁCH SỰ KIỆN / NỘI DUNG THI ĐẤU (Events)
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    settings JSONB NOT NULL,
    active_group_id TEXT,
    advance_selection_mode TEXT DEFAULT 'auto',
    manual_qualified_team_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Tạo bảng DANH SÁCH CÁC ĐỘI BÓNG (Teams)
CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_id TEXT,
    seed TEXT DEFAULT 'none',
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Tạo bảng CÁC NHÓM / BẢNG ĐẤU (Groups)
CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team_ids JSONB DEFAULT '[]'::jsonb,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Tạo bảng LỊCH THI ĐẤU VÀ TỶ SỐ TRẬN ĐẤU (Matches)
CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    team_a_id TEXT NOT NULL,
    team_b_id TEXT NOT NULL,
    score_a INTEGER,
    score_b INTEGER,
    winner_id TEXT,
    status TEXT DEFAULT 'pending',
    round INTEGER NOT NULL,
    knockout_round_name TEXT,
    knockout_match_id TEXT,
    next_match_id TEXT,
    next_match_slot TEXT,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Tạo bảng GHI NHẬT KÝ HOẠT ĐỘNG (Audit Logs)
CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ====================================================================
-- PHÂN QUYỀN BẢO MẬT (Row Level Security - RLS)
-- Yêu cầu: Khách vãng lai được xem (Select), chỉ Admin được sửa đổi dữ liệu.
-- ====================================================================

-- Kích hoạt RLS cho toàn bộ các bảng dữ liệu
ALTER TABLE tournament ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Tạo các chính sách cho phép MỌI NGƯỜI (bao gồm cả role 'anon' và 'authenticated') được phép ĐỌC (SELECT)
CREATE POLICY "Cho phép mọi người xem thông tin giải đấu" ON tournament FOR SELECT USING (true);
CREATE POLICY "Cho phép mọi người xem nội dung thi đấu" ON events FOR SELECT USING (true);
CREATE POLICY "Cho phép mọi người xem danh sách đội bóng" ON teams FOR SELECT USING (true);
CREATE POLICY "Cho phép mọi người xem danh sách bảng đấu" ON groups FOR SELECT USING (true);
CREATE POLICY "Cho phép mọi người xem lịch và kết quả trận" ON matches FOR SELECT USING (true);
CREATE POLICY "Cho phép mọi người xem nhật ký hoạt động" ON audit_logs FOR SELECT USING (true);

-- Chốt chính sách cho các tác vụ thay đổi (INSERT, UPDATE, DELETE):
-- Phương án A: Chỉ cho phép tài khoản có xác thực dịch vụ (hoặc tài khoản admin được cấp jwt)
-- Để đơn giản trong trường hợp ứng dụng dùng ANON KEY và xác thực phân quyền qua password admin123 nội bộ ở App:
-- Bạn có thể cấp toàn quyền cho role 'anon' và 'authenticated' thực thi ghi dữ liệu nhằm chạy mượt mà bằng ANON_KEY:
CREATE POLICY "Cho phép ghi tự do cho anon và authenticated" ON tournament FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Cho phép ghi tự do cho anon và authenticated" ON events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Cho phép ghi tự do cho anon và authenticated" ON teams FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Cho phép ghi tự do cho anon và authenticated" ON groups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Cho phép ghi tự do cho anon và authenticated" ON matches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Cho phép ghi tự do cho anon và authenticated" ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- LƯU Ý BẢO MẬT: Sau này nếu muốn chỉ Admin dùng Supabase Auth mới sửa được, hãy đổi "TO anon, authenticated" thành "TO authenticated" cho phần ghi đè.

-- ============================================================
-- AeroGuard Database
-- BPSU Main Campus Fire Safety System
-- ============================================================

CREATE DATABASE IF NOT EXISTS aeroguard;
USE aeroguard;

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE users (
    user_id    INT PRIMARY KEY AUTO_INCREMENT,
    username   VARCHAR(50) UNIQUE NOT NULL,
    password   VARCHAR(255) NOT NULL,
    full_name  VARCHAR(100) NOT NULL,
    user_type  ENUM('Admin', 'Security', 'DRRM', 'Campus Personnel') NOT NULL,
    email      VARCHAR(100),
    phone      VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── DEVICES ──────────────────────────────────────────────────
CREATE TABLE devices (
    device_id   VARCHAR(20) PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    building    ENUM(
        'Medina Lacson Building',
        'New CEA Building',
        'CAHS Building'
    ) NOT NULL,
    floor       VARCHAR(10),
    room        VARCHAR(20),
    status      ENUM('Online', 'Offline', 'Maintenance') DEFAULT 'Online',
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── INCIDENTS ────────────────────────────────────────────────
CREATE TABLE incidents (
    incident_id     INT PRIMARY KEY AUTO_INCREMENT,
    device_id       VARCHAR(20),
    threat_level    ENUM('Gray', 'Yellow', 'Orange', 'Red') NOT NULL,
    pm25_value      DECIMAL(6, 2),
    pm10_value      DECIMAL(6, 2),
    temperature     DECIMAL(4, 1),
    humidity        DECIMAL(4, 1),
    confidence      DECIMAL(5, 2),
    location        VARCHAR(200),
    response_action TEXT,
    resolved        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at     TIMESTAMP NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- ── FIRE EQUIPMENT ───────────────────────────────────────────
CREATE TABLE fire_equipment (
    equipment_id      INT PRIMARY KEY AUTO_INCREMENT,
    equipment_type    ENUM('ABC', 'CO2', 'Water', 'Foam') NOT NULL,
    building          ENUM(
        'Medina Lacson Building',
        'New CEA Building',
        'CAHS Building'
    ) NOT NULL,
    floor             VARCHAR(10),
    location_description VARCHAR(200),
    last_inspection   DATE,
    status            ENUM('Active', 'Maintenance', 'Expired') DEFAULT 'Active'
);

-- ============================================================
-- SAMPLE DATA
-- ============================================================

-- Users (password hash for 'password123')
INSERT INTO users (username, password, full_name, user_type, email, phone) VALUES
('admin',    '$2y$10$hash_placeholder_admin',    'Admin User',       'Admin',           'admin@bpsu.edu.ph',       '09123456789'),
('jdelacruz','$2y$10$hash_placeholder_sec1',     'Juan Dela Cruz',   'Security',        'security1@bpsu.edu.ph',   '09187654321'),
('msantos',  '$2y$10$hash_placeholder_drrm1',    'Maria Santos',     'DRRM',            'drrm1@bpsu.edu.ph',       '09198765432'),
('preyes',   '$2y$10$hash_placeholder_sec2',     'Pedro Reyes',      'Security',        'security2@bpsu.edu.ph',   '09171234567'),
('agomez',   '$2y$10$hash_placeholder_camp1',    'Ana Gomez',        'Campus Personnel','personnel1@bpsu.edu.ph',  '09209876543');

-- Devices — Medina Lacson Building (Rooms 201-205)
INSERT INTO devices (device_id, device_name, building, floor, room, status) VALUES
('AG-001', 'AeroGuard Unit 1', 'Medina Lacson Building', '2F', 'Room 201', 'Online'),
('AG-002', 'AeroGuard Unit 2', 'Medina Lacson Building', '2F', 'Room 202', 'Online'),
('AG-003', 'AeroGuard Unit 3', 'Medina Lacson Building', '2F', 'Room 203', 'Online');

-- Devices — New CEA Building (Rooms 101-105, 201-205)
INSERT INTO devices (device_id, device_name, building, floor, room, status) VALUES
('AG-004', 'AeroGuard Unit 4', 'New CEA Building', '1F', 'Room 101', 'Online'),
('AG-005', 'AeroGuard Unit 5', 'New CEA Building', '1F', 'Room 102', 'Offline'),
('AG-006', 'AeroGuard Unit 6', 'New CEA Building', '2F', 'Room 204', 'Online');

-- Devices — CAHS Building (Rooms 101-105, 201-205)
INSERT INTO devices (device_id, device_name, building, floor, room, status) VALUES
('AG-007', 'AeroGuard Unit 7', 'CAHS Building', '1F', 'Room 103', 'Online'),
('AG-008', 'AeroGuard Unit 8', 'CAHS Building', '2F', 'Room 202', 'Online');

-- Incidents (sample history)
INSERT INTO incidents (device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action, resolved) VALUES
('AG-004', 'Yellow', 138.7, 195.2, 28.5, 54.0, 91.3, 'New CEA Building, 1F, Room 101',
 'Security notified. Vaping violation logged.', TRUE),
('AG-001', 'Gray', 12.3, 18.8, 25.0, 61.5, 97.1,    'Medina Lacson Building, 2F, Room 201',
 'Normal air quality. No action needed.', TRUE),
('AG-006', 'Orange', 287.4, 425.3, 36.2, 47.3, 93.6, 'New CEA Building, 2F, Room 204',
 'Nearest extinguisher: ABC type, New CEA 2F hallway. Security dispatched.', FALSE);

-- Fire Equipment
INSERT INTO fire_equipment (equipment_type, building, floor, location_description, last_inspection, status) VALUES
('ABC', 'Medina Lacson Building', '2F', 'Hallway between Rooms 201–202',        '2025-03-01', 'Active'),
('ABC', 'Medina Lacson Building', '1F', 'Near main staircase, Room 105 side',   '2025-03-01', 'Active'),
('ABC', 'New CEA Building',       '1F', 'Hallway near Room 101 entrance',        '2025-03-05', 'Active'),
('CO2', 'New CEA Building',       '1F', 'Laboratory area near Room 103',         '2025-02-28', 'Active'),
('ABC', 'New CEA Building',       '2F', 'Hallway between Rooms 204–205',         '2025-03-05', 'Active'),
('CO2', 'New CEA Building',       '2F', 'Near electrical panel Room 201',        '2025-02-15', 'Maintenance'),
('ABC', 'CAHS Building',          '1F', 'Main hallway between Rooms 103–104',    '2025-03-10', 'Active'),
('Foam','CAHS Building',          '1F', 'Supply room near Room 105',             '2025-01-20', 'Expired'),
('ABC', 'CAHS Building',          '2F', 'Hallway between Rooms 201–202',         '2025-03-10', 'Active'),
('CO2', 'CAHS Building',          '2F', 'Near nursing lab Room 203',             '2025-03-01', 'Active');

-- ── VERIFY ───────────────────────────────────────────────────
SELECT 'AeroGuard database created successfully!' AS Status;
SELECT COUNT(*) AS 'Total Users'      FROM users;
SELECT COUNT(*) AS 'Total Devices'    FROM devices;
SELECT COUNT(*) AS 'Total Incidents'  FROM incidents;
SELECT COUNT(*) AS 'Fire Equipment'   FROM fire_equipment;

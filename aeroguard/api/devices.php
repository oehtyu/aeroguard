<?php
// ============================================================
// AeroGuard - Devices API
// File: C:\xampp\htdocs\aeroguard\api\devices.php
// ============================================================

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($method) {

    // ── GET ALL DEVICES ──────────────────────────────────────
    case 'GET':
        $db     = getDB();
        $result = $db->query("SELECT device_id, device_name, building, floor, room, status FROM devices ORDER BY device_id ASC");
        $rows   = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'data' => $rows]);
        $db->close();
        break;

    // ── ADD DEVICE ────────────────────────────────────────────
    case 'POST':
        $id       = strtoupper(trim($input['device_id']   ?? ''));
        $name     = trim($input['device_name'] ?? '');
        $building = trim($input['building']    ?? '');
        $floor    = trim($input['floor']       ?? '');
        $room     = trim($input['room']        ?? '');
        $status   = trim($input['status']      ?? 'Online');

        if (!$id || !$name || !$building) {
            respond(false, 'Device ID, name, and building are required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("INSERT INTO devices (device_id, device_name, building, floor, room, status) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssss', $id, $name, $building, $floor, $room, $status);

        if ($stmt->execute()) {
            respond(true, 'Device added successfully.');
        } else {
            respond(false, 'Failed to add device. ID may already exist.');
        }

        $stmt->close();
        $db->close();
        break;

    // ── EDIT DEVICE ──────────────────────────────────────────
    case 'PUT':
        $id       = strtoupper(trim($input['device_id']   ?? ''));
        $name     = trim($input['device_name'] ?? '');
        $building = trim($input['building']    ?? '');
        $floor    = trim($input['floor']       ?? '');
        $room     = trim($input['room']        ?? '');
        $status   = trim($input['status']      ?? 'Online');

        if (!$id || !$name) {
            respond(false, 'Device ID and name are required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("UPDATE devices SET device_name=?, building=?, floor=?, room=?, status=? WHERE device_id=?");
        $stmt->bind_param('ssssss', $name, $building, $floor, $room, $status, $id);

        if ($stmt->execute()) {
            respond(true, 'Device updated successfully.');
        } else {
            respond(false, 'Failed to update device: ' . $db->error);
        }

        $stmt->close();
        $db->close();
        break;

    // ── DELETE DEVICE ────────────────────────────────────────
    case 'DELETE':
        $id = strtoupper(trim($input['device_id'] ?? ''));

        if (!$id) {
            respond(false, 'Device ID is required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("DELETE FROM devices WHERE device_id = ?");
        $stmt->bind_param('s', $id);

        if ($stmt->execute()) {
            respond(true, 'Device deleted successfully.');
        } else {
            respond(false, 'Failed to delete device: ' . $db->error);
        }

        $stmt->close();
        $db->close();
        break;

    default:
        respond(false, 'Method not allowed.');
}

function respond($success, $message, $data = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $data));
    exit;
}

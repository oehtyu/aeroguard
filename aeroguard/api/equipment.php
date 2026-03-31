<?php
// ============================================================
// AeroGuard - Fire Equipment API
// File: C:\xampp\htdocs\aeroguard\api\equipment.php
// ============================================================

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($method) {

    // ── GET ALL EQUIPMENT ────────────────────────────────────
    case 'GET':
        $db     = getDB();
        $result = $db->query("SELECT equipment_id, equipment_type, building, floor, location_description, last_inspection, status FROM fire_equipment ORDER BY equipment_id ASC");
        $rows   = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'data' => $rows]);
        $db->close();
        break;

    // ── ADD EQUIPMENT ─────────────────────────────────────────
    case 'POST':
        $type       = trim($input['equipment_type']      ?? '');
        $building   = trim($input['building']            ?? '');
        $floor      = trim($input['floor']               ?? '');
        $location   = trim($input['location_description']?? '');
        $inspection = trim($input['last_inspection']     ?? '');
        $status     = trim($input['status']              ?? 'Active');

        if (!$type || !$building) {
            respond(false, 'Equipment type and building are required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("INSERT INTO fire_equipment (equipment_type, building, floor, location_description, last_inspection, status) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssss', $type, $building, $floor, $location, $inspection, $status);

        if ($stmt->execute()) {
            respond(true, 'Equipment added successfully.', ['equipment_id' => $db->insert_id]);
        } else {
            respond(false, 'Failed to add equipment: ' . $db->error);
        }

        $stmt->close();
        $db->close();
        break;

    // ── DELETE EQUIPMENT ──────────────────────────────────────
    case 'DELETE':
        $id = intval($input['equipment_id'] ?? 0);
        if (!$id) { respond(false, 'Equipment ID is required.'); break; }

        $db   = getDB();
        $stmt = $db->prepare("DELETE FROM fire_equipment WHERE equipment_id = ?");
        $stmt->bind_param('i', $id);

        if ($stmt->execute()) {
            respond(true, 'Equipment deleted successfully.');
        } else {
            respond(false, 'Failed to delete equipment: ' . $db->error);
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

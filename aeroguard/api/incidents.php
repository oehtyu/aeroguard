<?php
// ============================================================
// AeroGuard - Incidents API
// File: C:\xampp\htdocs\aeroguard\api\incidents.php
// ============================================================

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($method) {

    // ── GET INCIDENTS ────────────────────────────────────────
    case 'GET':
        $db     = getDB();
        $level  = $_GET['level'] ?? '';

        if ($level) {
            $stmt = $db->prepare("SELECT incident_id, device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action, resolved, created_at FROM incidents WHERE threat_level = ? ORDER BY created_at DESC LIMIT 100");
            $stmt->bind_param('s', $level);
            $stmt->execute();
            $result = $stmt->get_result();
        } else {
            $result = $db->query("SELECT incident_id, device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action, resolved, created_at FROM incidents ORDER BY created_at DESC LIMIT 100");
        }

        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'data' => $rows]);
        $db->close();
        break;

    // ── LOG INCIDENT (from sensor/simulation) ────────────────
    case 'POST':
        $deviceId  = trim($input['device_id']     ?? '');
        $level     = trim($input['threat_level']   ?? '');
        $pm25      = floatval($input['pm25_value'] ?? 0);
        $pm10      = floatval($input['pm10_value'] ?? 0);
        $temp      = floatval($input['temperature']?? 0);
        $hum       = floatval($input['humidity']   ?? 0);
        $conf      = floatval($input['confidence'] ?? 0);
        $location  = trim($input['location']       ?? '');
        $action    = trim($input['response_action']?? '');

        if (!$deviceId || !$level) {
            respond(false, 'Device ID and threat level are required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("INSERT INTO incidents (device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssdddddss', $deviceId, $level, $pm25, $pm10, $temp, $hum, $conf, $location, $action);

        if ($stmt->execute()) {
            respond(true, 'Incident logged.', ['incident_id' => $db->insert_id]);
        } else {
            respond(false, 'Failed to log incident: ' . $db->error);
        }

        $stmt->close();
        $db->close();
        break;

    // ── RESOLVE INCIDENT ─────────────────────────────────────
    case 'PUT':
        $id = intval($input['incident_id'] ?? 0);
        if (!$id) { respond(false, 'Incident ID required.'); break; }

        $db   = getDB();
        $stmt = $db->prepare("UPDATE incidents SET resolved = 1, resolved_at = NOW() WHERE incident_id = ?");
        $stmt->bind_param('i', $id);

        if ($stmt->execute()) {
            respond(true, 'Incident marked as resolved.');
        } else {
            respond(false, 'Failed to resolve incident.');
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

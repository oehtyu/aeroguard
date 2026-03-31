<?php
// ============================================================
// AeroGuard - Authentication API
// File: C:\xampp\htdocs\aeroguard\api\auth.php
// ============================================================

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {

    // ── LOGIN ────────────────────────────────────────────────
    case 'login':
        if ($method !== 'POST') { respond(false, 'Method not allowed'); break; }

        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';

        if (!$username || !$password) {
            respond(false, 'Username and password are required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("SELECT user_id, username, full_name, user_type, email, phone FROM users WHERE username = ? AND password = ?");
        $stmt->bind_param('ss', $username, $password);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows === 0) {
            respond(false, 'Incorrect username or password.');
        } else {
            $user = $result->fetch_assoc();
            respond(true, 'Login successful.', ['user' => $user]);
        }

        $stmt->close();
        $db->close();
        break;

    default:
        respond(false, 'Unknown action.');
}

function respond($success, $message, $data = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $data));
    exit;
}

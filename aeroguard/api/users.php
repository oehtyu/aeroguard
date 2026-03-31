<?php
// ============================================================
// AeroGuard - Users API
// File: C:\xampp\htdocs\aeroguard\api\users.php
// Handles: GET (list), POST (add), PUT (edit), DELETE (remove)
// ============================================================

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($method) {

    // ── GET ALL USERS ────────────────────────────────────────
    case 'GET':
        $db     = getDB();
        $result = $db->query("SELECT user_id, username, full_name, user_type, email, phone FROM users ORDER BY user_id ASC");
        $users  = [];
        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }
        echo json_encode(['success' => true, 'data' => $users]);
        $db->close();
        break;

    // ── ADD USER ─────────────────────────────────────────────
    case 'POST':
        $fullname = trim($input['full_name']  ?? '');
        $username = trim($input['username']   ?? '');
        $password = trim($input['password']   ?? '');
        $role     = trim($input['user_type']  ?? '');
        $email    = trim($input['email']      ?? '');
        $phone    = trim($input['phone']      ?? '');

        if (!$fullname || !$username || !$password || !$role) {
            respond(false, 'Full name, username, password, and role are required.');
            break;
        }

        $allowed = ['Admin', 'Security', 'DRRM', 'Campus Personnel'];
        if (!in_array($role, $allowed)) {
            respond(false, 'Invalid role.');
            break;
        }

        $db = getDB();

        // Check username uniqueness
        $check = $db->prepare("SELECT user_id FROM users WHERE username = ?");
        $check->bind_param('s', $username);
        $check->execute();
        if ($check->get_result()->num_rows > 0) {
            respond(false, 'Username already exists.');
        }
        $check->close();

        $stmt = $db->prepare("INSERT INTO users (username, password, full_name, user_type, email, phone) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssss', $username, $password, $fullname, $role, $email, $phone);

        if ($stmt->execute()) {
            respond(true, 'User added successfully.', ['user_id' => $db->insert_id]);
        } else {
            respond(false, 'Failed to add user: ' . $db->error);
        }

        $stmt->close();
        $db->close();
        break;

    // ── EDIT USER ────────────────────────────────────────────
    case 'PUT':
        $userId   = intval($input['user_id']  ?? 0);
        $fullname = trim($input['full_name']  ?? '');
        $username = trim($input['username']   ?? '');
        $role     = trim($input['user_type']  ?? '');
        $email    = trim($input['email']      ?? '');
        $phone    = trim($input['phone']      ?? '');
        $password = trim($input['password']   ?? '');  // optional

        if (!$userId || !$fullname || !$username || !$role) {
            respond(false, 'User ID, full name, username, and role are required.');
            break;
        }

        $db = getDB();

        if ($password) {
            // Update with new password
            $stmt = $db->prepare("UPDATE users SET full_name=?, username=?, user_type=?, email=?, phone=?, password=? WHERE user_id=?");
            $stmt->bind_param('ssssssi', $fullname, $username, $role, $email, $phone, $password, $userId);
        } else {
            // Keep existing password
            $stmt = $db->prepare("UPDATE users SET full_name=?, username=?, user_type=?, email=?, phone=? WHERE user_id=?");
            $stmt->bind_param('sssssi', $fullname, $username, $role, $email, $phone, $userId);
        }

        if ($stmt->execute()) {
            respond(true, 'User updated successfully.');
        } else {
            respond(false, 'Failed to update user: ' . $db->error);
        }

        $stmt->close();
        $db->close();
        break;

    // ── DELETE USER ──────────────────────────────────────────
    case 'DELETE':
        $userId = intval($input['user_id'] ?? 0);

        if (!$userId) {
            respond(false, 'User ID is required.');
            break;
        }

        $db   = getDB();
        $stmt = $db->prepare("DELETE FROM users WHERE user_id = ?");
        $stmt->bind_param('i', $userId);

        if ($stmt->execute()) {
            respond(true, 'User deleted successfully.');
        } else {
            respond(false, 'Failed to delete user: ' . $db->error);
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

<?php
declare(strict_types=1);
/**
 * FadiFront / Infomaniak Apache PHP: gate in front of the static React build.
 * TEMPORARY DEMONSTRATION ONLY. Credentials: admin / 1234.
 * Change the credential hash before using with private data.
 */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params([
    'lifetime' => 0, 'path' => '/', 'secure' => $https,
    'httponly' => true, 'samesite' => 'Lax'
]);
session_name('FADI_FRONT_SESSION');
session_start();
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: private, no-store, max-age=0');
$logged = isset($_SESSION['fadi_authenticated']) && $_SESSION['fadi_authenticated'] === true;
if (isset($_GET['logout'])) {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time()-42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
    header('Location: /', true, 303);
    exit;
}
$csrf = $_SESSION['csrf'] ??= bin2hex(random_bytes(24));
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    $fails = (int)($_SESSION['fails'] ?? 0);
    $blocked = (int)($_SESSION['blocked_until'] ?? 0);
    $validCsrf = hash_equals((string)$csrf, (string)($_POST['csrf'] ?? ''));
    // bcrypt hash of demonstration password "1234"; never rely on this as a strong password.
    $passHash = '$2y$12$3dFieRcjCCJUXy6zSKatouEyX7XawWAgHtyjLyPMsD1KaqY/Tot2O';
    $valid = $validCsrf && hash_equals('admin', (string)($_POST['username'] ?? ''))
        && password_verify((string)($_POST['password'] ?? ''), $passHash);
    if (time() >= $blocked && $valid) {
        session_regenerate_id(true);
        $_SESSION['fadi_authenticated'] = true;
        $_SESSION['fails'] = 0;
        $_SESSION['blocked_until'] = 0;
        header('Location: /', true, 303);
        exit;
    }
    $fails++;
    $_SESSION['fails'] = $fails;
    if ($fails >= 5) $_SESSION['blocked_until'] = time() + 300;
    $error = 'Identifiants incorrects ou accès momentanément limité.';
}
$logged = isset($_SESSION['fadi_authenticated']) && $_SESSION['fadi_authenticated'] === true;
if (!$logged) {
    if (isset($_GET['asset'])) { http_response_code(403); exit; }
    header('Content-Type: text/html; charset=utf-8');
    $message = $error ? '<p class="error" role="alert">'.htmlspecialchars($error, ENT_QUOTES, 'UTF-8').'</p>' : '';
    $csrfOut = htmlspecialchars((string)$csrf, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fadi — Connexion</title><style> :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef4ee;font:15px/1.5 Arial,sans-serif;color:#183d32;padding:20px}.card{background:white;border:1px solid #dce5df;box-shadow:0 20px 70px #173f3520;padding:38px;border-radius:15px;width:min(410px,100%)}.eyebrow{font-size:12px;letter-spacing:.16em;color:#53705f;font-weight:700}.brand{font-size:31px;font-weight:750;margin:8px 0}h1{font-size:23px;margin:16px 0 8px}p{color:#536a5b}label{display:block;margin:15px 0 6px;font-weight:600}input{width:100%;border:1px solid #b9cbc0;border-radius:7px;padding:12px;font:inherit}input:focus{outline:2px solid #2f795d}button{width:100%;border:0;background:#173f35;color:white;border-radius:8px;padding:13px 16px;margin-top:20px;font:600 15px Arial;cursor:pointer}.error{color:#981e25;background:#fff1f0;padding:10px;border-radius:7px}.note{font-size:12px;margin-top:20px} </style></head><body><main class="card"><div class="eyebrow">ESPACE DE TRAVAIL</div><div class="brand">Fadi</div><h1>Connexion</h1><p>Accès à la version de démonstration de Fadi.</p>'.$message.'<form action="/" method="post"><input type="hidden" name="action" value="login"><input type="hidden" name="csrf" value="'.$csrfOut.'"><label for="user">Utilisateur</label><input id="user" name="username" autocomplete="username" required autofocus><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Se connecter</button></form><p class="note">Démonstration sans synchronisation ni serveur de données.</p></main></body></html>';
    exit;
}
// Serve only built assets within this document root after authentication.
if (isset($_GET['asset'])) {
    $relative = (string)$_GET['asset'];
    if ($relative === '' || str_contains($relative, "\0") || str_starts_with($relative, '.')
        || preg_match('~(^|/)\.~', $relative) || str_contains($relative, '\\')) {
        http_response_code(404); exit;
    }
    $root = realpath(__DIR__);
    $file = realpath(__DIR__.'/'.$relative);
    if ($root === false || $file === false || !str_starts_with($file, $root.'/')
        || !is_file($file) || str_ends_with(strtolower($relative), '.php') || $relative === 'front.html') {
        http_response_code(404); exit;
    }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $types = [
        'js'=>'text/javascript', 'css'=>'text/css', 'html'=>'text/html',
        'wasm'=>'application/wasm', 'json'=>'application/json', 'svg'=>'image/svg+xml',
        'png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp',
        'ico'=>'image/x-icon','woff'=>'font/woff','woff2'=>'font/woff2',
        'ttf'=>'font/ttf','glb'=>'model/gltf-binary','pdf'=>'application/pdf',
        'kml'=>'application/vnd.google-earth.kml+xml','kmz'=>'application/vnd.google-earth.kmz'
    ];
    if (!isset($types[$ext])) { http_response_code(404); exit; }
    header('Content-Type: '.$types[$ext]);
    header('Content-Length: '.filesize($file));
    readfile($file);
    exit;
}
$file = __DIR__.'/front.html';
if (!is_file($file)) { http_response_code(503); echo 'FadiFront build manquant.'; exit; }
header('Content-Type: text/html; charset=utf-8');
readfile($file);

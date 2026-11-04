<?php

declare(strict_types=1);

// All account changes below are restricted to a marked disposable installation.
$root = getenv('GLPI_TEST_ROOT');
$fixture = getenv('GLPI12_TEST_FIXTURE');
if (!$root || !$fixture || !is_file($root . '/.tinisys-disposable-test')) {
    throw new RuntimeException('An explicitly marked disposable GLPI root and fixture output are required.');
}
require $root . '/vendor/autoload.php';
$kernel = new Glpi\Kernel\Kernel();
$kernel->boot();
if (!preg_match('/^12\.0\./', GLPI_VERSION)) {
    throw new RuntimeException('This fixture requires GLPI 12.0.x.');
}
Config::setConfigurationValues('core', [
    'enable_api' => 1,
    'enable_api_login_credentials' => 1,
    'enable_api_login_external_token' => 1,
    'enable_hlapi' => 1,
]);
$auth = new Auth();
$auth->user = new User();
$auth->user->getFromDB(2);
$auth->auth_succeded = true;
Session::init($auth);
$password = 'Glpi12-Test!' . bin2hex(random_bytes(24));
$user = new User();
if (!$user->update(['id' => 2, 'password' => $password, 'password2' => $password])) {
    throw new RuntimeException('Test password update failed.');
}
$client = new APIClient();
if (!$client->add(['name' => 'Disposable MCP test', 'is_active' => 1, 'app_token' => ''])) {
    throw new RuntimeException('Legacy fixture failed.');
}
$oauth = new OAuthClient();
$id = $oauth->add([
    'name' => 'Disposable MCP test', 'is_active' => 1, 'is_confidential' => 1,
    'grants' => ['password', 'refresh_token'], 'scopes' => ['api', 'user'],
]);
if (!$id || !$oauth->getFromDB($id)) {
    throw new RuntimeException('OAuth fixture failed.');
}
// Set permissions before writing the generated credentials, never print them.
$handle = fopen($fixture, 'x');
if ($handle === false || !chmod($fixture, 0600)) {
    throw new RuntimeException('Unable to create private fixture file.');
}
fwrite($handle, json_encode([
    'username' => 'glpi', 'password' => $password,
    'clientId' => $oauth->fields['identifier'],
    'clientSecret' => (new GLPIKey())->decrypt($oauth->fields['secret']),
], JSON_THROW_ON_ERROR));
fclose($handle);
echo "Disposable API fixtures configured.\n";

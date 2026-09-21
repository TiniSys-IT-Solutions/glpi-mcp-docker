#!/usr/bin/env bash
set -euo pipefail

container_name="${1:-glpi-app}"
target_file="/var/www/glpi/src/Glpi/Inventory/MainAsset/Unmanaged.php"

if ! docker inspect "$container_name" >/dev/null 2>&1; then
    echo "Erreur : conteneur '$container_name' introuvable." >&2
    exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$container_name")" != "true" ]; then
    echo "Erreur : le conteneur '$container_name' n'est pas demarre." >&2
    exit 1
fi

echo "Application du correctif GLPI Unmanaged dans '$container_name'..."

docker exec -i "$container_name" php -- "$target_file" <<'PHP'
<?php

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) {
    fwrite(STDERR, "Erreur : fichier GLPI introuvable : {$path}\n");
    exit(1);
}

$contents = file_get_contents($path);
if ($contents === false) {
    fwrite(STDERR, "Erreur : lecture impossible : {$path}\n");
    exit(1);
}

$original = <<<'CODE'
        foreach ($this->ruleentity_data as $attribute => $value) {
            $val->{$attribute} = $value;
        }
CODE;

$patched = <<<'CODE'
        foreach ($this->ruleentity_data as $attribute => $value) {
            $known_key = md5($attribute . $value);
            $this->known_links[$known_key] = $value;
            $val->{$attribute} = $value;
        }
CODE;

if (str_contains($contents, $patched)) {
    echo "Correctif deja present.\n";
    exit(0);
}

$occurrences = substr_count($contents, $original);
if ($occurrences !== 1) {
    fwrite(
        STDERR,
        "Erreur : bloc attendu trouve {$occurrences} fois. Version GLPI non reconnue, aucune modification effectuee.\n"
    );
    exit(1);
}

$updated = str_replace($original, $patched, $contents, $replacement_count);
if ($replacement_count !== 1 || file_put_contents($path, $updated) === false) {
    fwrite(STDERR, "Erreur : ecriture du correctif impossible.\n");
    exit(1);
}

echo "Correctif applique.\n";
PHP

docker exec "$container_name" php -l "$target_file"
docker exec "$container_name" php /var/www/glpi/bin/console cache:clear

echo "Termine. Ne redemarrez pas le conteneur avant le test en cours."

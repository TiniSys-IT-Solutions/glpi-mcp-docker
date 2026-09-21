# Title

Network discovery creates a numeric Location instead of using the location ID assigned by RuleImportEntity for Unmanaged assets

## Code of Conduct

- [x] I agree to follow this project's Code of Conduct

## Disable plugins

- [ ] I reproduce the issue with all plugins disabled

> Before submission, reproduce the request below through GLPI's native inventory endpoint with all plugins disabled, then check this box. The affected execution path is implemented in GLPI core.

## Is there an existing issue for this?

- [x] I have searched the existing issues

## Version

GLPI 11.0.8

## Bug description

When a network discovery creates an `Unmanaged` asset and a matching `RuleImportEntity` assigns both an entity and an existing location, GLPI creates a new Location whose name is the numeric location ID instead of linking the asset to the existing Location.

For example, if the matching rule returns:

```text
entities_id = 2
locations_id = 7
```

GLPI creates a new Location with `name = "7"` in entity 2. The newly discovered Unmanaged asset is linked to that new Location instead of the existing Location with ID 7.

The discovery payload does not contain a location or SNMP sysLocation value. The numeric value comes only from the `RuleImportEntity` action.

The issue appears specific to `Glpi\Inventory\MainAsset\Unmanaged::rulepassed()`.

The generic implementation in `MainAsset::rulepassed()` registers values coming from `ruleentity_data` in `known_links` before calling `handleLinks()`:

```php
foreach ($this->ruleentity_data as $attribute => $value) {
    $known_key = md5($attribute . $value);
    $this->known_links[$known_key] = $value;
    $val->{$attribute} = $value;
}
```

The Unmanaged override does not register these known links:

```php
foreach ($this->ruleentity_data as $attribute => $value) {
    $val->{$attribute} = $value;
}
```

As a result, `InventoryAsset::handleLinks()` treats the already resolved `locations_id` as an external Location name and calls:

```php
Dropdown::importExternal('Location', $value->$key, $entities_id);
```

This imports the string representation of the ID as a new Location name.

Adding the two missing `known_links` lines to the Unmanaged override prevents creation of the numeric Location and links the discovered asset to the existing Location.

## Relevant log output

No PHP or SQL error is logged. The inventory is accepted and the Unmanaged asset is created, but with a newly created numeric Location.

## Page URL

`/front/unmanaged.php`

## Steps To reproduce

1. Create an entity with ID 2.
2. Create an existing Location with ID 7 that is available to entity 2.
3. Create and enable a `RuleImportEntity` rule with:
   - IP address matches CIDR `192.0.2.0/24`;
   - assign entity ID 2;
   - assign location ID 7.
4. Ensure no Location named `7` exists.
5. Submit the following network discovery request to GLPI's native inventory endpoint:

```xml
<REQUEST>
  <CONTENT>
    <DEVICE>
      <DNSHOSTNAME>192.0.2.10</DNSHOSTNAME>
      <ENTITY>2</ENTITY>
      <IP>192.0.2.10</IP>
    </DEVICE>
    <MODULEVERSION>7.2</MODULEVERSION>
    <PROCESSNUMBER>1</PROCESSNUMBER>
  </CONTENT>
  <DEVICEID>test-agent-0001</DEVICEID>
  <QUERY>NETDISCOVERY</QUERY>
</REQUEST>
```

6. Open the newly created Unmanaged asset and inspect its Location.
7. Inspect the Locations list.

### Actual result

- A new Location named `7` is created in entity 2.
- The Unmanaged asset references this new Location.

### Expected result

- No new Location is created.
- The Unmanaged asset references the existing Location with ID 7 assigned by the rule.

## Your GLPI setup information

Please paste a sanitized copy of `Setup > General > System` here. Remove hostnames, internal URLs, IP addresses, database names, paths that identify the organization, and user information.

## Anything else?

The following patch was tested locally and fixed the behavior:

```diff
 foreach ($this->ruleentity_data as $attribute => $value) {
+    $known_key = md5($attribute . $value);
+    $this->known_links[$known_key] = $value;
     $val->{$attribute} = $value;
 }
```

Suggested regression coverage:

- process a network discovery that resolves to an Unmanaged asset;
- make a `RuleImportEntity` return an existing `locations_id`;
- assert that the Unmanaged asset keeps this ID;
- assert that no Location named after the numeric ID is created.

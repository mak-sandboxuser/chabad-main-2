param(
  [Parameter(Mandatory = $true)]
  [string]$WebhookUrl,

  [string]$AccountId = "001Jx00001nghLaIAI",
  [string]$ContactId = "003Jx00001ZtPkHIAV",
  [ValidateSet("child", "primary", "secondary")]
  [string]$MemberType = "child"
)

$ErrorActionPreference = "Stop"

function Get-RoleFields {
  param([string]$Type)

  switch ($Type) {
    "primary" {
      return @{
        role = "Parent"
        isPrimary = $true
        isSecondary = $false
        isChild = $false
        isPrimaryMember = $true
        isSecondaryMember = $false
      }
    }
    "secondary" {
      return @{
        role = "Parent"
        isPrimary = $false
        isSecondary = $true
        isChild = $false
        isPrimaryMember = $false
        isSecondaryMember = $true
      }
    }
    default {
      return @{
        role = "Child"
        isPrimary = $false
        isSecondary = $false
        isChild = $true
        isPrimaryMember = $false
        isSecondaryMember = $false
      }
    }
  }
}

Write-Host "Checking DNS for hook.us2.make.com..."
Resolve-DnsName hook.us2.make.com | Select-Object -First 1 | Format-Table -AutoSize

$roleFields = Get-RoleFields -Type $MemberType

$body = @{
  action = "add_family_member"
  objectType = "Relationship"
  source = "member_portal"
  operation = "set_household_role"
  householdAccountId = $AccountId
  accountId = $AccountId
  accountName = "Test Household"
  contactId = $ContactId
  requestedByContactId = "003TESTREQUESTEDBY"
  requestedByEmail = "test@example.com"
  memberType = $MemberType
  contactRole = $roleFields.role
  householdRole = $roleFields.role
  crmRole = $roleFields.role
  acrRole = $roleFields.role
  acrRoles = $roleFields.role
  includeInRollUp = $true
  soqlFindRelationship = "SELECT Id FROM OneCRM__Relationship__c WHERE OneCRM__Contact__c = '$ContactId' AND OneCRM__Account__c = '$AccountId' LIMIT 1"
} + $roleFields

$json = $body | ConvertTo-Json -Compress -Depth 5
Write-Host "POST $WebhookUrl"
Write-Host $json

$response = Invoke-RestMethod -Uri $WebhookUrl -Method POST -ContentType "application/json" -Body $json
Write-Host "Response:"
$response | ConvertTo-Json -Depth 5

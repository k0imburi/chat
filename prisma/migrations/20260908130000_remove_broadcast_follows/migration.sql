DELETE f
FROM `Follow` f
INNER JOIN `User` u ON u.id = f.followedId
WHERE u.externalId = 'system:chatandtip';

DELETE f
FROM `Follow` f
INNER JOIN `User` u ON u.id = f.followerId
WHERE u.externalId = 'system:chatandtip';

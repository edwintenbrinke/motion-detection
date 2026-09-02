<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Adds the v2 tables: Event (Frigate review-item mirror), Device (push tokens) and
 * NotificationRule. See docs/v2/07-api-and-data-model.md.
 *
 * Generated with doctrine:migrations:diff and then trimmed by hand: the raw diff also
 * picked up unrelated pre-existing schema drift on motion_detected_file/settings/user/
 * messenger_messages (datetime_immutable COMMENT annotations, a messenger_messages index)
 * that has nothing to do with this change -- left alone here so this migration does
 * exactly one thing.
 */
final class Version20260902211020 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add event, device and notification_rule tables (docs/v2)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE device (id INT AUTO_INCREMENT NOT NULL, token VARCHAR(512) NOT NULL, platform VARCHAR(32) NOT NULL, app_version VARCHAR(32) DEFAULT NULL, last_seen DATETIME NOT NULL, enabled TINYINT NOT NULL, created_at DATETIME NOT NULL, user_id INT NOT NULL, INDEX IDX_92FB68EA76ED395 (user_id), UNIQUE INDEX UNIQ_DEVICE_TOKEN (token), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE event (id VARCHAR(64) NOT NULL, camera VARCHAR(64) NOT NULL, severity VARCHAR(255) NOT NULL, label VARCHAR(64) NOT NULL, sub_label VARCHAR(64) DEFAULT NULL, zones JSON NOT NULL, derived_tags JSON NOT NULL, top_score DOUBLE PRECISION DEFAULT NULL, started_at DATETIME NOT NULL, ended_at DATETIME DEFAULT NULL, has_clip TINYINT NOT NULL, has_snapshot TINYINT NOT NULL, title VARCHAR(255) DEFAULT NULL, description LONGTEXT DEFAULT NULL, genai_severity VARCHAR(32) DEFAULT NULL, seen TINYINT NOT NULL, feedback LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, INDEX idx_event_camera_started_at (camera, started_at), INDEX idx_event_severity_started_at (severity, started_at), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE notification_rule (id INT AUTO_INCREMENT NOT NULL, priority INT NOT NULL, camera VARCHAR(64) DEFAULT NULL, zone VARCHAR(64) DEFAULT NULL, labels JSON NOT NULL, sub_labels JSON NOT NULL, from_time VARCHAR(5) DEFAULT NULL, to_time VARCHAR(5) DEFAULT NULL, action VARCHAR(255) NOT NULL, cooldown_seconds INT NOT NULL, enabled TINYINT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, user_id INT NOT NULL, INDEX IDX_FEE4E7F6A76ED395 (user_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE device ADD CONSTRAINT FK_92FB68EA76ED395 FOREIGN KEY (user_id) REFERENCES user (id)');
        $this->addSql('ALTER TABLE notification_rule ADD CONSTRAINT FK_FEE4E7F6A76ED395 FOREIGN KEY (user_id) REFERENCES user (id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device DROP FOREIGN KEY FK_92FB68EA76ED395');
        $this->addSql('ALTER TABLE notification_rule DROP FOREIGN KEY FK_FEE4E7F6A76ED395');
        $this->addSql('DROP TABLE device');
        $this->addSql('DROP TABLE event');
        $this->addSql('DROP TABLE notification_rule');
    }
}

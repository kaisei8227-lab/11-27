package com.example.cardgame;

import java.net.URI;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CardGameApplication {

	public static void main(String[] args) {
		configureDatabase();
		SpringApplication.run(CardGameApplication.class, args);
	}

	/**
	 * Render の PostgreSQL を使う設定。
	 *  - DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD（render.yaml の Blueprint で自動設定）
	 *  - または DATABASE_URL（postgres://ユーザー:パスワード@ホスト:ポート/DB名）
	 * どちらも無ければ application(-prod).properties の H2 データベースのまま起動する。
	 */
	static void configureDatabase() {
		// SPRING_DATASOURCE_URL（Neon など）。Neon の画面の「postgresql://ユーザー:パスワード@ホスト/DB」をそのまま貼っても動くようにする
		String springUrl = System.getenv("SPRING_DATASOURCE_URL");
		if (springUrl != null && !springUrl.isBlank()) {
			springUrl = springUrl.trim();
			if (springUrl.startsWith("postgres://") || springUrl.startsWith("postgresql://")) {
				fromPostgresUrl(springUrl);
			} else if (springUrl.startsWith("jdbc:postgresql:")) {
				System.setProperty("spring.datasource.driver-class-name", "org.postgresql.Driver");
				System.setProperty("spring.jpa.database-platform", "org.hibernate.dialect.PostgreSQLDialect");
			}
			return;
		}
		String host = System.getenv("DB_HOST");
		if (host != null && !host.isBlank()) {
			String port = env("DB_PORT", "5432");
			setDb("jdbc:postgresql://" + host + ":" + port + "/" + env("DB_NAME", "cardgame"),
					env("DB_USER", ""), env("DB_PASSWORD", ""));
			return;
		}
		String url = System.getenv("DATABASE_URL");
		if (url != null && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
			fromPostgresUrl(url);
		}
	}

	/** postgres://ユーザー:パスワード@ホスト:ポート/DB名?sslmode=require → JDBC の URL・ユーザー名・パスワード */
	private static void fromPostgresUrl(String url) {
		try {
			URI uri = new URI(url.replaceFirst("^postgres(ql)?://", "http://"));
			String[] userInfo = uri.getRawUserInfo() == null ? new String[0] : uri.getRawUserInfo().split(":", 2);
			int port = uri.getPort() == -1 ? 5432 : uri.getPort();
			String query = uri.getRawQuery() == null ? "sslmode=require" : uri.getRawQuery();
			String user = userInfo.length > 0 ? decode(userInfo[0]) : env("SPRING_DATASOURCE_USERNAME", "");
			String password = userInfo.length > 1 ? decode(userInfo[1]) : env("SPRING_DATASOURCE_PASSWORD", "");
			setDb("jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getRawPath() + "?" + query, user, password);
		} catch (Exception e) {
			System.err.println("データベースの URL を読み取れませんでした: " + e.getMessage());
		}
	}

	private static String decode(String s) {
		return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
	}

	private static void setDb(String jdbcUrl, String user, String password) {
		System.setProperty("spring.datasource.url", jdbcUrl);
		System.setProperty("spring.datasource.username", user);
		System.setProperty("spring.datasource.password", password);
		System.setProperty("spring.datasource.driver-class-name", "org.postgresql.Driver");
		// 接続に失敗しても起動は続け、原因を StartupLog に出せるよう方言を明示する
		System.setProperty("spring.jpa.database-platform", "org.hibernate.dialect.PostgreSQLDialect");
	}

	private static String env(String key, String fallback) {
		String v = System.getenv(key);
		return v == null || v.isBlank() ? fallback : v;
	}
}

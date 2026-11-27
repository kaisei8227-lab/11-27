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
		String host = System.getenv("DB_HOST");
		if (host != null && !host.isBlank()) {
			String port = env("DB_PORT", "5432");
			setDb("jdbc:postgresql://" + host + ":" + port + "/" + env("DB_NAME", "cardgame"),
					env("DB_USER", ""), env("DB_PASSWORD", ""));
			return;
		}
		String url = System.getenv("DATABASE_URL");
		if (url != null && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
			try {
				URI uri = new URI(url.replaceFirst("^postgres(ql)?://", "http://"));
				String[] userInfo = uri.getUserInfo() == null ? new String[] { "", "" } : uri.getUserInfo().split(":", 2);
				int port = uri.getPort() == -1 ? 5432 : uri.getPort();
				setDb("jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getPath(),
						userInfo[0], userInfo.length > 1 ? userInfo[1] : "");
			} catch (Exception e) {
				System.err.println("DATABASE_URL を読み取れなかったため、H2 データベースで起動します: " + e.getMessage());
			}
		}
	}

	private static void setDb(String jdbcUrl, String user, String password) {
		System.setProperty("spring.datasource.url", jdbcUrl);
		System.setProperty("spring.datasource.username", user);
		System.setProperty("spring.datasource.password", password);
		System.setProperty("spring.datasource.driver-class-name", "org.postgresql.Driver");
	}

	private static String env(String key, String fallback) {
		String v = System.getenv(key);
		return v == null || v.isBlank() ? fallback : v;
	}
}

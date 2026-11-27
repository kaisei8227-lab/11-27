# ===== Render 用 Dockerfile（Spring Boot / Gradle / Java 21）=====
# 1段目: Gradle でビルドして実行用の jar を作る
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
# Windows で作った gradlew は改行コードが CRLF のことがあるので LF に直し、実行できるようにする
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew
RUN ./gradlew bootJar -x test --no-daemon
# bootJar 以外の「-plain.jar」は使わないので除き、app.jar という名前にそろえる
RUN cp "$(ls build/libs/*.jar | grep -v -- "-plain.jar" | head -n 1)" /app/app.jar

# 2段目: 実行に必要な JRE と jar だけを入れた軽いイメージ
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/app.jar app.jar
# Render の無料プランはメモリ 512MB なので、Java が使うメモリを控えめにする
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k"
ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080
CMD ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
